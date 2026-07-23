/**
 * Per-conversation media settings.
 *
 * Stored on `Conversation.metadata` JSON so we don't need a Prisma migration.
 * Companion-level defaults live on `Companion.metadata.defaultMediaSettings`
 * and are used to seed the conversation on creation.
 */

import type { Prisma } from "@prisma/client";

export type AutoMode = "off" | "ask" | "on";

export interface ConversationMediaSettings {
  /** How auto-pic generation behaves when intent fires. Default: "ask". */
  autoPics: AutoMode;
  /** How auto-video generation behaves when intent fires. Default: "off". */
  autoVideos: AutoMode;
  /** Default aspect ratio for image generation. */
  defaultImageAspect: "portrait" | "square" | "landscape";
  /** Default image style label (free-form to match the modal). */
  defaultImageStyle?: string;
  /** Default aspect ratio for video generation. */
  defaultVideoAspect: "portrait" | "square" | "landscape";
  /** Default video duration in seconds. */
  defaultVideoDuration: 5 | 8 | 10;
  /** Default video mode — animate the last photo or pure text-to-video. */
  defaultVideoMode: "from-last-photo" | "text-only";
}

export const DEFAULT_MEDIA_SETTINGS: ConversationMediaSettings = {
  autoPics: "ask",
  autoVideos: "off",
  defaultImageAspect: "portrait",
  defaultImageStyle: undefined,
  defaultVideoAspect: "portrait",
  defaultVideoDuration: 5,
  defaultVideoMode: "from-last-photo",
};

const KEY = "mediaSettings";

function clampAutoMode(v: unknown): AutoMode | undefined {
  if (v === "off" || v === "ask" || v === "on") return v;
  return undefined;
}

function clampAspect(v: unknown): "portrait" | "square" | "landscape" | undefined {
  if (v === "portrait" || v === "square" || v === "landscape") return v;
  return undefined;
}

function clampDuration(v: unknown): 5 | 8 | 10 | undefined {
  if (v === 5 || v === 8 || v === 10) return v;
  if (v === "5" || v === "8" || v === "10") return Number(v) as 5 | 8 | 10;
  return undefined;
}

function clampVideoMode(v: unknown): "from-last-photo" | "text-only" | undefined {
  if (v === "from-last-photo" || v === "text-only") return v;
  return undefined;
}

/**
 * Reads the merged media settings out of a Conversation.metadata JSON value,
 * falling back to companion defaults and then to global defaults. Always
 * returns a fully-populated object.
 */
export function readMediaSettings(
  conversationMetadata: Prisma.JsonValue | null | undefined,
  companionMetadata?: Prisma.JsonValue | null | undefined
): ConversationMediaSettings {
  const conv =
    conversationMetadata && typeof conversationMetadata === "object" && !Array.isArray(conversationMetadata)
      ? ((conversationMetadata as Record<string, unknown>)[KEY] as Record<string, unknown> | undefined)
      : undefined;
  const comp =
    companionMetadata && typeof companionMetadata === "object" && !Array.isArray(companionMetadata)
      ? ((companionMetadata as Record<string, unknown>)["defaultMediaSettings"] as Record<string, unknown> | undefined)
      : undefined;

  // Conv overrides companion, companion overrides defaults.
  const pickAuto = (k: keyof ConversationMediaSettings, fallback: AutoMode): AutoMode =>
    clampAutoMode(conv?.[k]) ?? clampAutoMode(comp?.[k]) ?? fallback;

  const pickAspect = (
    k: keyof ConversationMediaSettings,
    fallback: "portrait" | "square" | "landscape"
  ) => clampAspect(conv?.[k]) ?? clampAspect(comp?.[k]) ?? fallback;

  return {
    autoPics: pickAuto("autoPics", DEFAULT_MEDIA_SETTINGS.autoPics),
    autoVideos: pickAuto("autoVideos", DEFAULT_MEDIA_SETTINGS.autoVideos),
    defaultImageAspect: pickAspect("defaultImageAspect", DEFAULT_MEDIA_SETTINGS.defaultImageAspect),
    defaultImageStyle:
      typeof conv?.defaultImageStyle === "string"
        ? (conv.defaultImageStyle as string)
        : typeof comp?.defaultImageStyle === "string"
        ? (comp.defaultImageStyle as string)
        : DEFAULT_MEDIA_SETTINGS.defaultImageStyle,
    defaultVideoAspect: pickAspect("defaultVideoAspect", DEFAULT_MEDIA_SETTINGS.defaultVideoAspect),
    defaultVideoDuration:
      clampDuration(conv?.defaultVideoDuration) ??
      clampDuration(comp?.defaultVideoDuration) ??
      DEFAULT_MEDIA_SETTINGS.defaultVideoDuration,
    defaultVideoMode:
      clampVideoMode(conv?.defaultVideoMode) ??
      clampVideoMode(comp?.defaultVideoMode) ??
      DEFAULT_MEDIA_SETTINGS.defaultVideoMode,
  };
}

/**
 * Merges new partial settings into an existing Conversation.metadata JSON
 * and returns the full updated metadata object suitable for prisma.update.
 */
export function writeMediaSettings(
  existingMetadata: Prisma.JsonValue | null | undefined,
  partial: Partial<ConversationMediaSettings>
): Record<string, unknown> {
  const base =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};

  const current = (base[KEY] as Record<string, unknown> | undefined) ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) next[k] = v;
  }
  base[KEY] = next;
  return base;
}
