/**
 * Per-conversation scene state.
 *
 * Tracks what the companion is "currently" wearing, where she is, her mood,
 * and the last photo she shared. The state is stored on
 * `Conversation.metadata.sceneState` alongside `mediaSettings`, so no Prisma
 * migration is required.
 *
 * Two update paths feed it:
 *  1. After each generated image — we know exactly the scene that was shown,
 *     so we write `lastImageUrl` + `lastImageScene` and best-effort extract
 *     outfit / location words from the scene description.
 *  2. After each assistant text reply — a small regex pass mines explicit
 *     outfit / location / mood mentions ("I just changed into a red dress",
 *     "let's go to the balcony", "feeling playful").
 *
 * The injected system prompt block keeps the LLM and the image prompt
 * builders in lock-step so outfit/location drift is reduced across turns.
 */

import type { Prisma } from "@prisma/client";

export interface ConversationSceneState {
  /** What the companion is currently wearing (free-form short phrase). */
  outfit?: string;
  /** Where the companion currently is. */
  location?: string;
  /** Companion's current mood / vibe. */
  mood?: string;
  /** URL of the most recent photo the companion shared. */
  lastImageUrl?: string;
  /** Scene description that produced the most recent photo. */
  lastImageScene?: string;
  /** ISO timestamp of the last update. */
  updatedAt?: string;
}

const KEY = "sceneState";

// ── Lightweight extraction regexes ───────────────────────────────────────────

const OUTFIT_PATTERNS: RegExp[] = [
  /\b(?:wearing|dressed in|draped in|wrapped in|in a|in my|put on|slipping into|slipped into|changed into|threw on|thrown on|got on)\b\s+([a-z][a-z0-9 ,'\-]{2,60}?)(?=[.!?,;]|$)/i,
  /\bi['’]m in\b\s+([a-z][a-z0-9 ,'\-]{2,60}?)(?=[.!?,;]|$)/i,
];

const LOCATION_PATTERNS: RegExp[] = [
  /\b(?:at the|at my|on the|in the|inside the|under the|by the|beside the)\b\s+([a-z][a-z0-9 \-]{2,50}?)(?=[.!?,;]|$)/i,
  /\b(?:headed to|going to|came back from|just got to|arrived at|moved to)\b\s+(?:the\s+)?([a-z][a-z0-9 \-]{2,50}?)(?=[.!?,;]|$)/i,
];

const MOOD_PATTERNS: RegExp[] = [
  /\b(?:feeling|i feel|i['’]m feeling|in the mood for|in a)\b\s+([a-z][a-z \-]{2,30}?)(?=[.!?,;]|$)/i,
];

const NOISE_OUTFIT = /\b(right now|today|for you|at the moment|just now|now|tonight)\b/gi;

function clean(value: string | undefined | null, max = 60): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(NOISE_OUTFIT, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:!?'"-]+|[\s,.;:!?'"-]+$/g, "")
    .trim()
    .slice(0, max);
  return cleaned.length >= 3 ? cleaned : undefined;
}

function matchFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1]) {
      const cleaned = clean(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

/**
 * Extract scene-relevant fields from a chunk of assistant text. Returns only
 * the fields that were confidently found; other fields stay `undefined`.
 */
export function extractSceneFromAssistantText(
  text: string
): Partial<ConversationSceneState> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return {};
  const outfit = matchFirst(trimmed, OUTFIT_PATTERNS);
  const location = matchFirst(trimmed, LOCATION_PATTERNS);
  const mood = matchFirst(trimmed, MOOD_PATTERNS);
  const out: Partial<ConversationSceneState> = {};
  if (outfit) out.outfit = outfit;
  if (location) out.location = location;
  if (mood) out.mood = mood;
  return out;
}

/**
 * Extract scene-relevant fields from an IMAGE scene description (typed by
 * the user or built by the router). Outfit is mined the same way; the whole
 * cleaned phrase is also kept as `lastImageScene`.
 */
export function extractSceneFromImageScene(
  scene: string
): Partial<ConversationSceneState> {
  const trimmed = (scene ?? "").trim();
  if (!trimmed) return {};
  const out: Partial<ConversationSceneState> = {
    lastImageScene: trimmed.slice(0, 200),
  };
  const outfit = matchFirst(trimmed, OUTFIT_PATTERNS);
  if (outfit) out.outfit = outfit;
  const location = matchFirst(trimmed, LOCATION_PATTERNS);
  if (location) out.location = location;
  return out;
}

// ── Read / write ─────────────────────────────────────────────────────────────

export function readSceneState(
  conversationMetadata: Prisma.JsonValue | null | undefined
): ConversationSceneState {
  if (!conversationMetadata || typeof conversationMetadata !== "object" || Array.isArray(conversationMetadata)) {
    return {};
  }
  const raw = (conversationMetadata as Record<string, unknown>)[KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ConversationSceneState = {};
  if (typeof obj.outfit === "string") out.outfit = obj.outfit;
  if (typeof obj.location === "string") out.location = obj.location;
  if (typeof obj.mood === "string") out.mood = obj.mood;
  if (typeof obj.lastImageUrl === "string") out.lastImageUrl = obj.lastImageUrl;
  if (typeof obj.lastImageScene === "string") out.lastImageScene = obj.lastImageScene;
  if (typeof obj.updatedAt === "string") out.updatedAt = obj.updatedAt;
  return out;
}

/**
 * Merge a partial scene update into the existing Conversation.metadata JSON,
 * returning the full updated metadata object. Pass to prisma.update directly.
 */
export function writeSceneState(
  existingMetadata: Prisma.JsonValue | null | undefined,
  partial: Partial<ConversationSceneState>
): Record<string, unknown> {
  const base =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};
  const current = (base[KEY] as Record<string, unknown> | undefined) ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined && v !== "") next[k] = v;
  }
  next.updatedAt = new Date().toISOString();
  base[KEY] = next;
  return base;
}

/**
 * Build a CURRENT SCENE block suitable for injection into a system prompt or
 * image prompt. Returns an empty string when no scene fields are known.
 */
export function formatSceneBlock(state: ConversationSceneState): string {
  const lines: string[] = [];
  if (state.outfit) lines.push(`- Wearing: ${state.outfit}`);
  if (state.location) lines.push(`- Where: ${state.location}`);
  if (state.mood) lines.push(`- Mood: ${state.mood}`);
  if (state.lastImageScene) lines.push(`- Last photo I sent: "${state.lastImageScene}"`);
  if (lines.length === 0) return "";
  return ["CURRENT SCENE:", ...lines].join("\n");
}

/**
 * Compact one-liner used inside image prompts so outfit/location persist
 * across image requests without bloating the prompt.
 */
export function formatSceneForImagePrompt(state: ConversationSceneState): string {
  const bits: string[] = [];
  if (state.outfit) bits.push(`currently wearing ${state.outfit}`);
  if (state.location) bits.push(`at ${state.location}`);
  return bits.join(", ");
}
