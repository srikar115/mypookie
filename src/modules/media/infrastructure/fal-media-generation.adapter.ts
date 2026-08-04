import "server-only";
import type { MediaImageGenerator, GenerateMediaInput, GenerateMediaResult } from "../application/ports/media-image-generator";
import { submitToFalQueue, pollFalQueueStatus, fetchFalResult } from "@/shared/infrastructure/fal/fal-queue-client";
import { uploadFromUrl } from "@/shared/infrastructure/storage/r2";

/**
 * FalMediaGenerationAdapter
 *
 * Implements the MediaImageGenerator port using fal.ai queue APIs.
 *
 * Payload rules per spec:
 *   Always include: prompt, aspect_ratio, enable_safety_checker: false,
 *                   enable_prompt_expansion: false
 *   Edit models:    image_urls: [referenceUrl]
 *   Seed:           include if referenceImageUrl present (reuse seed)
 *
 * Storage:
 *   Downloads the generated asset and uploads it to R2.
 *   Falls back to the fal CDN URL in passthrough storage mode.
 */
export class FalMediaGenerationAdapter implements MediaImageGenerator {
  async generate(input: GenerateMediaInput): Promise<GenerateMediaResult> {
    const { modelSlug, prompt, kind, aspectRatio, referenceImageUrl, seed } = input;
    const falKind: "image" | "video" = kind === "IMAGE" ? "image" : "video";

    // Build fal payload.
    const falInput: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio,
      enable_safety_checker: false,
      enable_prompt_expansion: false,
    };

    const isEditModel = modelSlug.endsWith("/edit");

    if (isEditModel && referenceImageUrl) {
      // edit models use image_urls array
      falInput.image_urls = [referenceImageUrl];
    }

    if (referenceImageUrl && seed !== null) {
      falInput.seed = seed;
    }

    if (falKind === "video") {
      falInput.duration = typeof input.duration === "number" ? input.duration : 5;
      falInput.resolution = input.resolution ?? "720p";

      // Seedance doesn't support safety/prompt expansion flags — remove them.
      if (modelSlug.includes("seedance")) {
        delete falInput.enable_safety_checker;
        delete falInput.enable_prompt_expansion;
      }

      if (referenceImageUrl && modelSlug.includes("image-to-video")) {
        // Video image-to-video uses image_url (singular)
        falInput.image_url = referenceImageUrl;
      }
    }

    // Submit to fal queue.
    const { requestId, statusUrl, responseUrl } = await submitToFalQueue(modelSlug, falInput);

    // Poll until complete.
    await pollFalQueueStatus(statusUrl, falKind);

    // Fetch result.
    const result = await fetchFalResult(responseUrl);

    const assetUrl = falKind === "image" ? result.imageUrl : result.videoUrl;
    if (!assetUrl) {
      throw new Error(`fal returned no ${falKind} URL for model ${modelSlug}`);
    }

    // Build R2 key.
    const ext = falKind === "video" ? "mp4" : "webp";
    const r2Key = `chat-media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const contentType = falKind === "video" ? "video/mp4" : "image/webp";

    const upload = await uploadFromUrl(assetUrl, r2Key, contentType);

    return {
      storageKey: upload.key,
      storageUrl: upload.url,
      providerRequestId: requestId,
      seed: result.seed,
      finalModelSlug: modelSlug,
    };
  }
}
