import "server-only";
import type { MediaGenerationRepository } from "../ports/media-generation-repository";
import type { CreditGateway } from "../ports/credit-gateway";
import type { StartMediaInput, StartMediaResult } from "../dto/media-generation.dto";
import { MEDIA_COSTS } from "@/config/media";

/**
 * StartMediaGenerationUseCase
 *
 * Creates a PENDING media_generations row and an empty ASSISTANT message
 * placeholder linked by mediaGenerationId. Returns the IDs so the client
 * can immediately show a pending bubble and fire the async /api/media/run call.
 *
 * Credit debit happens in RunMediaGenerationUseCase on completion.
 * We assert affordability here so the UI can show a clear error before any
 * work is queued.
 */
export class StartMediaGenerationUseCase {
  constructor(
    private readonly mediaRepo: MediaGenerationRepository,
    private readonly credits: CreditGateway,
    private readonly db: import("@prisma/client").PrismaClient,
    private readonly ids: { next(): string },
  ) {}

  async execute(input: StartMediaInput): Promise<StartMediaResult> {
    const costCredits =
      input.kind === "VIDEO" ? MEDIA_COSTS.VIDEO : MEDIA_COSTS.IMAGE;

    // 1. Assert the user can afford the generation.
    await this.credits.assertAffordable(input.actorUserId, costCredits);

    // 2. Verify the conversation exists and belongs to the user.
    const conv = await this.db.conversation.findFirst({
      where: { id: input.conversationId, userId: input.actorUserId },
      select: { id: true, characterId: true },
    });
    if (!conv) {
      throw new Error("Conversation not found or access denied.");
    }

    const mediaId = this.ids.next();
    const messageId = this.ids.next();
    const userMessageId = input.userPromptText ? this.ids.next() : null;
    const now = new Date();
    // Nudge the assistant placeholder a millisecond later so the transcript
    // always orders the request above the photo it produced, however the
    // messages are re-fetched.
    const assistantAt = new Date(now.getTime() + 1);

    // 3. Create the media generation row (PENDING) and the assistant message
    //    placeholder in a single transaction.
    await this.db.$transaction(async (tx) => {
      await tx.mediaGeneration.create({
        data: {
          id: mediaId,
          userId: input.actorUserId,
          characterId: conv.characterId,
          conversationId: input.conversationId,
          kind: input.kind,
          status: "PENDING",
          prompt: input.prompt,
          costCredits,
          metadata: {
            aspectRatio: input.aspectRatio,
            style: input.style,
            editMode: input.editMode,
            referenceMediaId: input.referenceMediaId,
            promptIsFinal: input.promptIsFinal,
            modelFamilyId: input.modelFamilyId,
            resolution: input.resolution,
            duration: input.duration,
            offStreamRequest: input.userPromptText ?? null,
          },
          createdAt: now,
          updatedAt: now,
        },
      });

      if (userMessageId) {
        await tx.message.create({
          data: {
            id: userMessageId,
            conversationId: input.conversationId,
            role: "USER",
            status: "READY",
            content: input.userPromptText ?? "",
            createdAt: now,
          },
        });
      }

      await tx.message.create({
        data: {
          id: messageId,
          conversationId: input.conversationId,
          role: "ASSISTANT",
          status: "READY",
          content: "",
          mediaGenerationId: mediaId,
          createdAt: assistantAt,
        },
      });

      // Keep the conversation list ordered by real activity. Matters most for
      // the mode-pill path, which adds messages without going through the chat
      // stream that would otherwise have done this.
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: assistantAt },
      });
    });

    return { mediaId, messageId, costCredits, userMessageId };
  }
}
