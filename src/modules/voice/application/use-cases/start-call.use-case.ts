import "server-only";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type {
  ConversationRepository,
  ChatCharacterProvider,
} from "@/modules/chat";
import type { CallSessionRepository } from "../ports/call-session-repository";
import type {
  VoiceTransportGrant,
  VoiceTransportPort,
} from "../ports/voice-transport-port";
import type { CallSessionDto } from "../dto/call-session.dto";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "@/modules/chat";
import {
  ConcurrentCallLimitError,
  DailyCallLimitExceededError,
  VoiceTransportError,
} from "../../domain/errors";

export interface StartCallResult {
  readonly session: CallSessionDto;
  readonly grant: VoiceTransportGrant;
}

/**
 * StartCall — issues a LiveKit access token AND writes the CallSession
 * row that anchors the whole call lifecycle.
 *
 * Flow:
 *   1. Resolve + own the conversation (throws ConversationAccessDenied)
 *   2. Resolve + own the character   (throws ChatCharacterUnavailable)
 *   3. Concurrent-call guard        (throws ConcurrentCallLimit)
 *   4. Daily-cap guard              (throws DailyCallLimitExceeded)
 *   5. Insert CallSession row       (deterministic livekitRoom = "call_<id>")
 *   6. Mint LiveKit access token
 *
 * The room name is deterministic so the agent worker can derive it from
 * the session id without an extra round trip — the client sends the
 * session id in its metadata, the agent looks it up, and picks up the
 * same room.
 */
export class StartCallUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly characters: ChatCharacterProvider,
    private readonly callSessions: CallSessionRepository,
    private readonly transport: VoiceTransportPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly maxDailyMinutes: number,
    private readonly tokenTtlSeconds: number = 60 * 15,
  ) {}

  async execute(input: {
    actorUserId: string;
    actorDisplayName: string | null;
    conversationId: string;
  }): Promise<StartCallResult> {
    const conv = await this.conversations.findById(input.conversationId);
    if (!conv) throw new ConversationNotFoundError(input.conversationId);
    if (conv.userId !== input.actorUserId) {
      throw new ConversationAccessDeniedError(input.conversationId);
    }

    const character = await this.characters.getForActor(
      conv.characterId,
      input.actorUserId,
    );
    if (!character) {
      throw new ChatCharacterUnavailableError(conv.characterId);
    }

    const now = this.clock.now();

    const active = await this.callSessions.findActiveByUser(input.actorUserId);
    if (active) throw new ConcurrentCallLimitError(input.actorUserId);

    const minutesUsed = await this.callSessions.minutesUsedInLastDay(
      input.actorUserId,
      now,
    );
    if (minutesUsed >= this.maxDailyMinutes) {
      throw new DailyCallLimitExceededError(minutesUsed, this.maxDailyMinutes);
    }

    const sessionId = this.ids.next();
    const roomName = `call_${sessionId}`;

    const session = await this.callSessions.create({
      id: sessionId,
      conversationId: conv.id,
      userId: input.actorUserId,
      characterId: character.id,
      livekitRoom: roomName,
      now,
    });

    let grant: VoiceTransportGrant;
    try {
      grant = await this.transport.issueAccessToken({
        roomName,
        identity: `user_${input.actorUserId}`,
        displayName: input.actorDisplayName ?? "Guest",
        metadata: {
          callSessionId: sessionId,
          conversationId: conv.id,
          characterId: character.id,
        },
        ttlSeconds: this.tokenTtlSeconds,
      });
    } catch (e) {
      // Roll back the row we just wrote so the concurrent-call guard
      // doesn't refuse the next attempt.
      try {
        await this.callSessions.finalize({
          id: sessionId,
          endedAt: this.clock.now(),
          durationSec: 0,
          dropReason: "provider_error",
        });
      } catch {
        // best-effort; the guard is only advisory anyway
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new VoiceTransportError(`LiveKit token issuance failed: ${msg}`);
    }

    return { session, grant };
  }
}
