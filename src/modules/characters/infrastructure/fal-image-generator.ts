import "server-only";
import { fal } from "@fal-ai/client";
import { env } from "@/config/env";
import { uploadFromUrl } from "@/shared/infrastructure/storage/r2";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";
import { ImageGenerationFailedError } from "../domain/errors";
import type {
  GeneratedImage,
  GenerateImageInput,
  ImageGenerator,
} from "../application/ports/image-generator";

/**
 * FalImageGenerator — wraps whichever fal.ai model the operator has picked
 * for text→image and image→image via the `model_configs` table.
 *
 * `resolve(IMAGE_TEXT_TO_IMAGE).modelId` is the fal endpoint used for the
 * initial wizard render. `resolve(IMAGE_IMAGE_TO_IMAGE).modelId` is the fal
 * endpoint used for identity-locked regenerations. All per-model knobs
 * (`num_inference_steps`, `strength`, `image_size`, `enable_safety_checker`,
 * `output_format`, `acceleration`) come from `resolved.parameters` — the
 * hardcoded literals that used to live here have moved to the DB seed.
 *
 * Behavioral defaults ONLY kick in when a key is absent from the DB row, so
 * the wizard keeps working even against a partially-configured table.
 */

const DEFAULTS = {
  image_size: "portrait_4_3" as const,
  num_inference_steps: 8,
  output_format: "webp" as const,
  enable_safety_checker: false,
  num_images: 1,
  acceleration: "regular" as const,
  strength: 0.7,
} as const;

/**
 * Scene modifiers rotated across regens to push variety in pose / setting
 * even when the base prompt is fixed. Each modifier is appended to the
 * stored appearancePrompt at request time — the DB copy stays untouched.
 */
const SCENE_MODIFIERS: readonly string[] = [
  "different pose, natural stance",
  "outdoor golden-hour lighting, park background",
  "candid lifestyle photography, cafe scene",
  "urban street background, casual pose",
  "soft studio lighting, neutral background",
  "editorial fashion shoot, magazine style",
  "cozy indoor setting, warm ambient light",
  "seated pose, relaxed expression",
];

function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

function pickSceneModifier(): string {
  return SCENE_MODIFIERS[Math.floor(Math.random() * SCENE_MODIFIERS.length)];
}

let credentialsConfigured = false;
function ensureCredentials(): void {
  if (credentialsConfigured) return;
  if (!env.FAL_API_KEY) {
    throw new ImageGenerationFailedError(
      "FAL_API_KEY is not configured. Set it in .env to enable character image generation.",
    );
  }
  fal.config({ credentials: env.FAL_API_KEY });
  credentialsConfigured = true;
}

interface FalImageResponse {
  readonly images: ReadonlyArray<{
    readonly url: string;
    readonly content_type?: string;
  }>;
  readonly seed?: number;
  readonly has_nsfw_concepts?: readonly boolean[];
}

function isFalImageResponse(v: unknown): v is FalImageResponse {
  if (typeof v !== "object" || v === null) return false;
  const cast = v as { images?: unknown };
  return (
    Array.isArray(cast.images) &&
    cast.images.length > 0 &&
    typeof (cast.images[0] as { url?: unknown })?.url === "string"
  );
}

export class FalImageGenerator implements ImageGenerator {
  constructor(private readonly models: ModelConfigRepository) {}

  async generate(input: GenerateImageInput): Promise<GeneratedImage> {
    ensureCredentials();

    const isRegen = Boolean(input.referenceImageUrl);
    const model = await this.models.resolve(
      isRegen ? "IMAGE_IMAGE_TO_IMAGE" : "IMAGE_TEXT_TO_IMAGE",
    );

    const prompt = isRegen
      ? `${input.appearancePrompt}, ${pickSceneModifier()}`
      : input.appearancePrompt;

    const requestInput = this.buildFalInput({
      model,
      prompt,
      isRegen,
      referenceImageUrl: input.referenceImageUrl ?? null,
      seed: input.seed ?? randomSeed(),
    });

    let response: unknown;
    try {
      const result = await fal.subscribe(model.modelId, {
        input: requestInput,
        logs: false,
      });
      response = (result as { data?: unknown }).data ?? result;
    } catch (e) {
      throw new ImageGenerationFailedError(
        `fal ${model.modelId} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!isFalImageResponse(response)) {
      throw new ImageGenerationFailedError(
        `fal ${model.modelId} returned an unexpected shape.`,
      );
    }

    if (response.has_nsfw_concepts?.[0]) {
      // Fal's on-model safety heuristic is aggressive at this parameter tier
      // and false-positives on nearly any human-figure prompt. In-model
      // checker is disabled via `enable_safety_checker` in the parameters
      // jsonb; platform moderation (age gate + NSFW opt-in) is authoritative.
      console.info(
        `[fal] has_nsfw_concepts=true for character=${input.characterId}. ` +
          `Proceeding: platform moderation is authoritative.`,
      );
    }

    const first = response.images[0];
    const r2Key = buildR2Key(input.characterId);
    const contentType = first.content_type ?? "image/webp";

    try {
      const upload = await uploadFromUrl(first.url, r2Key, contentType);
      return {
        imageR2Key: upload.key,
        imageUrl: upload.url,
        seed: response.seed ?? 0,
        faceKeypoints: null,
      };
    } catch (e) {
      throw new ImageGenerationFailedError(
        `Uploading generated image to R2 failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Merges the model's DB-stored parameters over hardcoded fallback defaults,
   * then layers in the required per-call fields (prompt, seed, and — for
   * regens — the reference image URL + strength).
   */
  private buildFalInput(args: {
    model: ResolvedModel;
    prompt: string;
    isRegen: boolean;
    referenceImageUrl: string | null;
    seed: number;
  }): Record<string, unknown> {
    const params = args.model.parameters;
    const merged: Record<string, unknown> = {
      prompt: args.prompt,
      image_size: pickString(params, "image_size", DEFAULTS.image_size),
      num_inference_steps: pickNumber(
        params,
        "num_inference_steps",
        DEFAULTS.num_inference_steps,
      ),
      output_format: pickString(params, "output_format", DEFAULTS.output_format),
      enable_safety_checker: pickBool(
        params,
        "enable_safety_checker",
        DEFAULTS.enable_safety_checker,
      ),
      num_images: pickNumber(params, "num_images", DEFAULTS.num_images),
      acceleration: pickString(params, "acceleration", DEFAULTS.acceleration),
      seed: args.seed,
    };

    if (args.isRegen && args.referenceImageUrl) {
      merged.image_url = args.referenceImageUrl;
      merged.strength = pickNumber(params, "strength", DEFAULTS.strength);
    }

    return merged;
  }
}

function pickNumber(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  return typeof v === "number" ? v : fallback;
}

function pickString<T extends string>(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: T,
): T | string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

function pickBool(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

function buildR2Key(characterId: string): string {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `characters/${characterId}/${now}-${rand}.webp`;
}
