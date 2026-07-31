import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type { CallSessionRepository } from "../ports/call-session-repository";
import type { VoiceTransportPort } from "../ports/voice-transport-port";
import type { CallSessionDto } from "../dto/call-session.dto";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
} from "../../domain/errors";

export interface EndCallResult {
  readonly session: CallSessionDto;
  readonly alreadyEnded: boolean;
}

/**
 * Sentinel content for the call-boundary marker row we drop into the
 * transcript when a call ends. Format is kept simple so the client can
 * detect + parse it with one regex; ChatWorkspace maps this to a
 * `ChatMessage` with `kind: "call_ended"`.
 */
export const CALL_ENDED_MARKER_RE = /^\[\[voice_call_ended:(\d+)\]\]$/;
function formatCallEndedMarker(durationSec: number): string {
  return `[[voice_call_ended:${durationSec}]]`;
}

/**
 * EndCall — idempotent finalizer. Called by:
 *
 *   - the client, when the user taps hang-up (`POST /call/end`)
 *   - the LiveKit `room_finished` webhook, when the client disconnects
 *     abruptly (tab close, network drop)
 *   - the credit-ticker background job, when the user runs out of credits
 *
 * All three paths converge here. Idempotency is enforced by short-circuiting
 * when `session.endedAt` is already set.
 *
 * When the finalizer runs the "first" time (not already-ended) it also
 * writes a SYSTEM/VOICE marker row into `messages` so the chat transcript
 * shows a "Live Phone Call ended · Ns" chip at that spot. The marker
 * survives across reloads and lives alongside the real spoken turns
 * that RecordVoiceTurn persisted earlier.
 */
export class EndCallUseCase {
  constructor(
    private readonly callSessions: CallSessionRepository,
    private readonly transport: VoiceTransportPort,
    private readonly clock: Clock,
    private readonly db: PrismaClient,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    callSessionId: string;
    actorUserId: string | null;
    dropReason: string;
  }): Promise<EndCallResult> {
    const session = await this.callSessions.findById(input.callSessionId);
    if (!session) throw new CallSessionNotFoundError(input.callSessionId);
    // Actor null = webhook / system caller; skip the ownership check.
    if (input.actorUserId && session.userId !== input.actorUserId) {
      throw new CallSessionAccessDeniedError(input.callSessionId);
    }
    if (session.endedAt) {
      return { session, alreadyEnded: true };
    }

    const now = this.clock.now();
    const startedAt = new Date(session.startedAt);
    const durationMs = Math.max(0, now.getTime() - startedAt.getTime());
    const durationSec = Math.round(durationMs / 1000);

    const finalized = await this.callSessions.finalize({
      id: session.id,
      endedAt: now,
      durationSec,
      dropReason: input.dropReason,
    });

    // Drop the call-boundary marker into the transcript. Kept in a
    // separate try/catch: the marker is UX polish, not correctness — if
    // the write fails the call is still successfully ended.
    try {
      await this.db.message.create({
        data: {
          id: this.ids.next(),
          conversationId: session.conversationId,
          role: "SYSTEM",
          status: "READY",
          source: "VOICE",
          content: formatCallEndedMarker(durationSec),
          createdAt: now,
        },
      });
    } catch (e) {
      console.warn("[voice.end-call] marker insert failed", e);
    }

    // Force-close the LiveKit room. Best-effort: if it's already gone we
    // don't care.
    try {
      await this.transport.endRoom(session.livekitRoom);
    } catch (e) {
      console.warn(
        `[voice.end-call] transport.endRoom failed for ${session.livekitRoom}`,
        e,
      );
    }

    return { session: finalized, alreadyEnded: false };
  }
}
