/**
 * ImageGenerator — the port for producing a character portrait from the
 * compiled appearance prompt. The `regenerate` op accepts a reference image
 * URL for identity-locked variations (candy.ai's "Regenerate 0/2" pattern).
 *
 * Implementations must:
 *   1. Generate the image on the provider (fal.ai in our case)
 *   2. Persist the result to R2 (via the shared storage helper)
 *   3. Return the R2 key + public URL so the domain can persist them
 */

export interface GenerateImageInput {
  readonly characterId: string;
  readonly appearancePrompt: string;
  readonly baseStyle: "REALISTIC" | "ANIME" | "THREE_D" | "CARTOON";
  /** For image-to-image regeneration; omit for initial generation. */
  readonly referenceImageUrl?: string;
  /** Deterministic seed for reproducibility (mostly useful in tests). */
  readonly seed?: number;
}

export interface GeneratedImage {
  readonly imageR2Key: string;
  readonly imageUrl: string;
  readonly seed: number;
  /**
   * Optional structured face keypoints from the provider. Reserved for a
   * future identity-lock stack (Lumina-Realism-style pattern from
   * product-research §2.3). Fal Z-Image doesn't ship this yet; leave null.
   */
  readonly faceKeypoints: unknown | null;
}

export interface ImageGenerator {
  generate(input: GenerateImageInput): Promise<GeneratedImage>;
}
