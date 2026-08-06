import "server-only";
import { DEFAULT_IMAGE_ASPECT } from "@/config/media";
import type { createStartMediaGenerationUseCase } from "@/modules/media";
import type {
  LaunchedVisualRequest,
  VisualRequestLauncher,
} from "../application/ports/visual-request-launcher";

type StartMediaGeneration = ReturnType<typeof createStartMediaGenerationUseCase>;

/**
 * Adapter over the media module's public API.
 *
 * Every option is left at its default because a caller has no way to express
 * one — they said a sentence out loud, and that is the entire input. The
 * server picks the model and resolves a reference image for likeness exactly
 * as it does for the chat classifier's auto-generate path.
 */
export class MediaVisualRequestLauncher implements VisualRequestLauncher {
  constructor(private readonly startMedia: StartMediaGeneration) {}

  async start(input: {
    actorUserId: string;
    conversationId: string;
    scene: string;
  }): Promise<LaunchedVisualRequest | null> {
    try {
      const result = await this.startMedia.execute({
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        kind: "IMAGE",
        prompt: input.scene,
        aspectRatio: DEFAULT_IMAGE_ASPECT,
        style: null,
        editMode: false,
        referenceMediaId: null,
        // The turn webhook writes the user's spoken line into the thread, so
        // adding it here too would show their request twice.
        userPromptText: null,
        // No UI reviewed this prompt, so the builder still needs freedom to
        // add an identity core when there's no reference image to carry her
        // likeness — same as the chat classifier path.
        promptIsFinal: false,
        modelFamilyId: null,
        resolution: null,
        duration: null,
      });
      return { mediaId: result.mediaId };
    } catch (e) {
      // A photo is a bonus on a call; the conversation is the product.
      console.warn("[voice.visual-request] could not start generation", e);
      return null;
    }
  }
}
