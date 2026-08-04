import "server-only";
import type { ReferenceImageResolver } from "../ports/reference-image-resolver";
import type { CompanionVisualProfileReader } from "../ports/companion-visual-profile-reader";
import type { CompanionVisualPromptBuilder } from "./run-media-generation.use-case";
import type {
  PreviewMediaPromptInput,
  PreviewMediaPromptResult,
} from "../dto/media-generation.dto";

/**
 * PreviewMediaPromptUseCase
 *
 * Resolves the prompt a request would actually be sent with, so the composer
 * can show it instead of the raw phrase the user typed.
 *
 * Deliberately runs the *same* builder and the *same* reference resolution as
 * RunMediaGenerationUseCase. Anything less and the preview would be a
 * plausible-looking guess that drifts from what the provider receives, which is
 * worse than showing nothing — the user would be editing the wrong text.
 *
 * Read-only: no row is created and no credits are touched. The user has not
 * committed to anything at this point.
 */
export class PreviewMediaPromptUseCase {
  constructor(
    private readonly refResolver: ReferenceImageResolver,
    private readonly visualProfile: CompanionVisualProfileReader,
    private readonly promptBuilder: CompanionVisualPromptBuilder,
    private readonly db: import("@prisma/client").PrismaClient,
  ) {}

  async execute(input: PreviewMediaPromptInput): Promise<PreviewMediaPromptResult> {
    const conv = await this.db.conversation.findFirst({
      where: { id: input.conversationId, userId: input.actorUserId },
      select: { id: true, characterId: true },
    });
    if (!conv) {
      throw new Error("Conversation not found or access denied.");
    }

    const referenceUrl = await this.refResolver.resolve({
      referenceMediaId: input.referenceMediaId,
      userId: input.actorUserId,
      characterId: conv.characterId,
      conversationId: input.conversationId,
    });

    const profile = await this.visualProfile.read(conv.characterId);

    // Style is left out on purpose: it's a separate control in the composer
    // that stays live after this preview is rendered, and is appended at run
    // time. Baking it into the text here would either go stale the moment the
    // user changes the preset or get applied twice.
    const prompt = this.promptBuilder.build({
      userScene: input.scene,
      profile,
      style: null,
      hasReference: referenceUrl !== null,
      promptIsFinal: false,
    });

    return { prompt, hasReference: referenceUrl !== null };
  }
}
