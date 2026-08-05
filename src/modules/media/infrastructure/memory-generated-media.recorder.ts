import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { Clock } from "@/shared/application/clock";
import type {
  IngestTurnUseCase,
  RecordFactsUseCase,
  MemoryFactDraft,
} from "@/modules/memory";
import type { GeneratedMediaRecorder } from "../application/ports/generated-media-recorder";

/**
 * How long a photo stays in memory. Long enough to answer "that picture you
 * sent last week", short enough that a heavy month of generating doesn't
 * permanently occupy the handful of slots retrieval has room for. Preferences
 * and identity have no expiry; a specific snapshot does not deserve the same
 * standing.
 */
const PHOTO_MEMORY_TTL_DAYS = 60;

export class MemoryGeneratedMediaRecorder implements GeneratedMediaRecorder {
  constructor(
    private readonly recordFacts: RecordFactsUseCase,
    private readonly ingestTurn: IngestTurnUseCase,
    private readonly db: PrismaClient,
    private readonly clock: Clock,
  ) {}

  async record(input: {
    userId: string;
    characterId: string;
    characterName: string;
    conversationId: string;
    mediaGenerationId: string;
    kind: "IMAGE" | "VIDEO";
    scene: string;
    offStreamRequest: string | null;
  }): Promise<void> {
    const noun = input.kind === "VIDEO" ? "a short video" : "a photo";
    const scene = input.scene.trim();

    // Stated rather than extracted: the fact extractor is instructed to ignore
    // everything about the companion, so asking it to notice this would return
    // nothing. The scene text is kept verbatim in the content so semantic
    // search can reach it later from a paraphrase.
    const draft: MemoryFactDraft = {
      content: scene
        ? `${input.characterName} sent the user ${noun}: ${scene}`
        : `${input.characterName} sent the user ${noun}.`,
      category: "EVENT",
      entities: [input.characterName],
      valence: 0.4,
      confidence: 1,
      metadata: {
        mediaGenerationId: input.mediaGenerationId,
        kind: input.kind,
        source: "media_generation",
      },
      expiresAt: new Date(
        this.clock.nowMs() + PHOTO_MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    };

    await this.recordFacts.execute({
      userId: input.userId,
      characterId: input.characterId,
      drafts: [draft],
    });

    const request = input.offStreamRequest?.trim();
    if (request) {
      await this.ingestOffStreamTurn({ ...input, request, noun, scene });
    }
  }

  /**
   * The mode pill and the Edit button write their messages directly, so none
   * of the per-turn bookkeeping the chat stream does ever runs for them:
   * nothing extracts what the user asked for, the relationship counters stand
   * still, and the rolling summary never advances. This closes that gap.
   */
  private async ingestOffStreamTurn(input: {
    userId: string;
    characterId: string;
    characterName: string;
    conversationId: string;
    request: string;
    noun: string;
    scene: string;
  }): Promise<void> {
    const { request } = input;
    const assistantMessage = input.scene
      ? `*sends ${input.noun}* ${input.scene}`
      : `*sends ${input.noun}*`;

    const turnCount = await this.db.message.count({
      where: {
        conversationId: input.conversationId,
        role: { in: ["USER", "ASSISTANT"] },
      },
    });

    await this.ingestTurn.execute({
      userId: input.userId,
      characterId: input.characterId,
      characterName: input.characterName,
      conversationId: input.conversationId,
      userMessage: request,
      assistantMessage,
      sourceUserMessageId: null,
      turnCountAfterIngest: turnCount,
      recentTurnsForSummary: [
        { role: "user", content: request },
        { role: "assistant", content: assistantMessage },
      ],
    });
  }
}
