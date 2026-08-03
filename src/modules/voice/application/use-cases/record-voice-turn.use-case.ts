import "server-only";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type { PrismaClient } from "@prisma/client";
import type { CallSessionRepository } from "../ports/call-session-repository";
import type { VoiceTurnDto } from "../dto/voice-turn.dto";
import type { IngestTurnUseCase } from "@/modules/memory";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
} from "../../domain/errors";
import { stripStageDirections } from "../../domain/strip-stage-directions";
import {
  humanizeTtsMarkers,
  stripModalityTags,
} from "@/modules/chat";

/**
 * RecordVoiceTurn — persists a completed voice turn pair and schedules
 * memory ingestion.
 *
 * Called by:
 *   - `POST /api/webhooks/voice-agent/turn` (agent worker → web app)
 *
 * Writes two `messages` rows with `source=VOICE`, atomically:
 *   - USER    → the STT transcript
 *   - ASSISTANT → scrubbed LLM output (stage directions out, modality
 *     tags out, Cartesia `[laugh]` markers converted to `*laughs*`
 *     so the chat transcript matches text-mode expression style)
 *
 * Then bumps the CallSession.turnCount and fires the shared memory
 * `IngestTurnUseCase` on `after()` so voice conversations feed the same
 * memory pipeline as text.
 *
 * `after()` is caller-invoked (route handler) — this use case just returns
 * the ingest payload; the route wraps the call in `after()` so
 * server-side latency doesn't include memory extraction time.
 */
export interface RecordedVoiceTurn {
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly ingestPayload: {
    userId: string;
    characterId: string;
    characterName: string;
    conversationId: string;
    userMessage: string;
    assistantMessage: string;
    sourceUserMessageId: string;
    turnCountAfterIngest: number;
    recentTurnsForSummary: readonly {
      role: "user" | "assistant";
      content: string;
    }[];
  };
}

export class RecordVoiceTurnUseCase {
  constructor(
    private readonly db: PrismaClient,
    private readonly callSessions: CallSessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    turn: VoiceTurnDto;
    actorUserId: string;
  }): Promise<RecordedVoiceTurn> {
    const session = await this.callSessions.findById(input.turn.callSessionId);
    if (!session) {
      throw new CallSessionNotFoundError(input.turn.callSessionId);
    }
    if (session.userId !== input.actorUserId) {
      throw new CallSessionAccessDeniedError(input.turn.callSessionId);
    }

    const now = this.clock.now();
    const userId = this.ids.next();
    const assistantId = this.ids.next();
    // Three-stage clean for the chat transcript. Audio already played
    // the raw LLM text (with Cartesia markers); the persisted row must
    // match text-chat expression style so voice and typed bubbles look
    // like the same character:
    //   1. `stripStageDirections` — kill third-person narration /
    //      parentheticals that slipped past the voice protocol.
    //   2. `stripModalityTags` — models occasionally echo the
    //      composer's `[voice call]` / `[text chat]` history tags.
    //   3. `humanizeTtsMarkers` — `[laugh]` / `[Faint laugh]` →
    //      `*laughs*` / `*faint laugh*` so they render in the same
    //      purple italic as typed action beats.
    const rawAssistant = input.turn.assistantContent;
    const cleanedAssistant = humanizeTtsMarkers(
      stripModalityTags(stripStageDirections(rawAssistant)),
    );
    if (cleanedAssistant !== rawAssistant.trim()) {
      console.info("[voice.record-turn] scrubbed assistant content", {
        before: rawAssistant.slice(0, 200),
        after: cleanedAssistant.slice(0, 200),
      });
    }

    // Both rows in one transaction so the memory ingest sees a consistent
    // (userMessage, assistantMessage) pair even under concurrent writes.
    await this.db.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          id: userId,
          conversationId: session.conversationId,
          role: "USER",
          status: "READY",
          content: input.turn.userTranscript,
          source: "VOICE",
          audioR2Key: input.turn.userAudioR2Key ?? null,
          createdAt: now,
        },
      });
      // Assistant row is slightly newer so createdAt ordering is preserved
      // even at ms precision.
      const assistantNow = new Date(now.getTime() + 1);
      await tx.message.create({
        data: {
          id: assistantId,
          conversationId: session.conversationId,
          role: "ASSISTANT",
          status: "READY",
          content: cleanedAssistant,
          source: "VOICE",
          audioR2Key: input.turn.assistantAudioR2Key ?? null,
          ttsMarkupTags: input.turn.ttsMarkupTags
            ? Array.from(input.turn.ttsMarkupTags)
            : [],
          modelId: input.turn.modelId ?? null,
          createdAt: assistantNow,
        },
      });
      await tx.conversation.update({
        where: { id: session.conversationId },
        data: { lastMessageAt: assistantNow },
      });
    });

    await this.callSessions.bumpTurnCount(session.id);

    // Read the character's display name so the memory extractor can label
    // relationship facts correctly. Single lookup, small selection.
    const characterRow = await this.db.character.findUnique({
      where: { id: session.characterId },
      select: { name: true },
    });
    const characterName = characterRow?.name ?? "";

    return {
      userMessageId: userId,
      assistantMessageId: assistantId,
      ingestPayload: {
        userId: session.userId,
        characterId: session.characterId,
        characterName,
        conversationId: session.conversationId,
        userMessage: input.turn.userTranscript,
        assistantMessage: cleanedAssistant,
        sourceUserMessageId: userId,
        turnCountAfterIngest: session.turnCount + 2,
        recentTurnsForSummary: [
          { role: "user", content: input.turn.userTranscript },
          { role: "assistant", content: cleanedAssistant },
        ],
      },
    };
  }
}

/**
 * Convenience helper the route uses:
 *   after(() => ingestVoiceTurnInAfter(server, payload))
 */
export async function ingestVoiceTurnInAfter(
  ingest: IngestTurnUseCase,
  payload: RecordedVoiceTurn["ingestPayload"],
): Promise<void> {
  try {
    await ingest.execute(payload);
  } catch (e) {
    console.warn("[voice.record-turn] ingest failed", e);
  }
}
