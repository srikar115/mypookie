/**
 * Media generation constants — credit costs, aspect-ratio defaults, style
 * presets, fal model fallbacks, and the sibling-swap map.
 *
 * These are deploy-time constants. If you need runtime configurability, lift
 * the values into the `model_configs` parameters JSONB column instead.
 */

// ─── Credit costs ─────────────────────────────────────────────────────────────

export const MEDIA_COSTS = {
  /** Chat text reply (1 credit; displayed in the mode pill but not enforced here). */
  CHAT: 1,
  IMAGE: 10,
  VIDEO: 50,
} as const;

// ─── Aspect ratio defaults ────────────────────────────────────────────────────

export const DEFAULT_IMAGE_ASPECT = "1:1";
export const DEFAULT_VIDEO_ASPECT = "9:16";
export const DEFAULT_VIDEO_DURATION = 5; // seconds

export const ASPECT_RATIO_OPTIONS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIO_OPTIONS)[number];

// ─── Style presets ────────────────────────────────────────────────────────────

export const STYLE_PRESETS = [
  "Photoreal",
  "Cinematic",
  "Editorial",
  "Soft natural light",
  "Anime",
  "Illustration",
] as const;

export type StylePreset = (typeof STYLE_PRESETS)[number];

// ─── Video options ────────────────────────────────────────────────────────────

export const VIDEO_DURATION_OPTIONS = [5, 10] as const;
export const VIDEO_RESOLUTION_OPTIONS = ["480p", "720p", "1080p"] as const;
export const DEFAULT_VIDEO_RESOLUTION = "720p";

// ─── Model fallbacks ──────────────────────────────────────────────────────────

export const DEFAULT_CHAT_IMAGE_MODEL = "fal-ai/wan/v2.7/edit";
export const DEFAULT_CHAT_IMAGE_TEXT_TO_IMAGE_MODEL = "fal-ai/wan/v2.7/text-to-image";
export const DEFAULT_CHAT_VIDEO_MODEL = "fal-ai/wan/v2.7/text-to-video";

// ─── Selectable model catalog ─────────────────────────────────────────────────
//
// `model_configs` cannot back a user-facing picker: `purpose` is unique, so it
// holds exactly one row per purpose and describes the *admin default*, not the
// set of choices. Hence a curated catalog here.
//
// Users pick a *family*, never a variant. Whether a request runs the edit or
// the text-to-image/text-to-video endpoint depends on whether a reference image
// resolved, which is decided server-side at run time — exposing that as a
// choice would let someone select "edit" with nothing to edit.

export interface ChatMediaModelFamily {
  readonly id: string;
  readonly label: string;
  readonly kind: "IMAGE" | "VIDEO";
  /** Endpoint used when a reference image is available. */
  readonly withReference: string;
  /** Endpoint used when there is nothing to work from. */
  readonly withoutReference: string;
  readonly blurb: string;
  /** Shown as the pre-selected option. */
  readonly isDefault?: boolean;
}

export const CHAT_MEDIA_MODELS: readonly ChatMediaModelFamily[] = [
  {
    id: "wan-2.7",
    label: "Wan 2.7",
    kind: "IMAGE",
    withReference: "fal-ai/wan/v2.7/edit",
    withoutReference: "fal-ai/wan/v2.7/text-to-image",
    blurb: "Best likeness · ~20s",
    isDefault: true,
  },
  {
    id: "qwen-image-2",
    label: "Qwen Image 2",
    kind: "IMAGE",
    withReference: "fal-ai/qwen-image-2/edit",
    withoutReference: "fal-ai/qwen-image-2/text-to-image",
    blurb: "Sharper detail · slower",
  },
  {
    id: "wan-2.7-video",
    label: "Wan 2.7",
    kind: "VIDEO",
    withReference: "fal-ai/wan/v2.7/image-to-video",
    withoutReference: "fal-ai/wan/v2.7/text-to-video",
    blurb: "Smooth motion · ~2 min",
    isDefault: true,
  },
  {
    id: "seedance-1.5-pro",
    label: "Seedance 1.5 Pro",
    kind: "VIDEO",
    withReference: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
    withoutReference: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
    blurb: "More cinematic · slower",
  },
];

export function chatMediaModelsFor(
  kind: "IMAGE" | "VIDEO",
): readonly ChatMediaModelFamily[] {
  return CHAT_MEDIA_MODELS.filter((m) => m.kind === kind);
}

export function defaultChatMediaModelId(kind: "IMAGE" | "VIDEO"): string {
  const list = chatMediaModelsFor(kind);
  return (list.find((m) => m.isDefault) ?? list[0]).id;
}

/**
 * Family + reference availability → concrete fal endpoint.
 *
 * Returns null for an unknown id so callers fall back to the configured admin
 * default rather than trusting a slug that arrived over the wire. The picker is
 * a convenience; it is not an arbitrary-endpoint escape hatch.
 */
export function resolveModelFamilySlug(
  familyId: string,
  kind: "IMAGE" | "VIDEO",
  hasReference: boolean,
): string | null {
  const family = CHAT_MEDIA_MODELS.find((m) => m.id === familyId && m.kind === kind);
  if (!family) return null;
  return hasReference ? family.withReference : family.withoutReference;
}

// ─── Sibling-swap map ─────────────────────────────────────────────────────────
//
// When a /edit model is selected but no reference image is available, swap to
// the matching text-to-image sibling so the generation still proceeds.
//
// Keys are edit model slugs; values are the sibling T2I slug.

export const EDIT_TO_T2I_SIBLING: Record<string, string> = {
  "fal-ai/wan/v2.7/edit": "fal-ai/wan/v2.7/text-to-image",
  "fal-ai/qwen-image-2/edit": "fal-ai/qwen-image-2/text-to-image",
};

export function resolveImageModelSlug(
  modelSlug: string,
  hasReference: boolean,
): string {
  if (!hasReference && modelSlug.endsWith("/edit")) {
    return EDIT_TO_T2I_SIBLING[modelSlug] ?? modelSlug.replace("/edit", "/text-to-image");
  }
  return modelSlug;
}

// ─── Fal queue timeouts ───────────────────────────────────────────────────────

export const FAL_IMAGE_TIMEOUT_MS = 90_000;
export const FAL_VIDEO_TIMEOUT_MS = 5 * 60_000;
export const FAL_POLL_INTERVAL_MS = 2_500;

// ─── Intent classification thresholds ────────────────────────────────────────

export const INTENT_AMBIGUOUS_THRESHOLD = 0.6;
export const INTENT_AUTO_GENERATE_THRESHOLD = 0.85;

// ─── Offer cadence cooldown ───────────────────────────────────────────────────
// Min gap between companion-initiated media offers in a single conversation.

export const OFFER_COOLDOWN_SECONDS = 5 * 60;
