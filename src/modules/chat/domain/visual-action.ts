/**
 * Visual-action sentinel protocol for the LLM.
 *
 * The model can optionally append a hidden control sentinel at the very end of
 * its reply to signal media generation or an offer:
 *
 *   <<VA{"mode":"generate","mediaType":"image","scene":"...","edit":false}>>
 *
 * This module:
 *   1. Strips the sentinel from text before it reaches the DB, TTS, or client.
 *   2. Parses the JSON payload for the stream route to act on.
 *
 * No "server-only" import — same pattern as sanitize-reply.ts. The client uses
 * stripVisualActionSentinel as a display-safety guard on the buffered reply.
 *
 * Why a hand-written scanner instead of a regex: models are unreliable about
 * the exact terminator (we see `}>`, `}>>`, and `}>>>` in the wild) and the
 * `scene` string routinely contains `>` and `}` characters. A naive
 * /<<VA(\{[^>]*\})>>/ misses all of those, and a miss is expensive — the raw
 * sentinel leaks into the transcript AND the generation never fires.
 */

const OPEN = "<<VA";

export interface VisualActionPayload {
  mode: "generate" | "offer";
  mediaType: "image" | "video";
  scene: string;
  edit: boolean;
  aspect?: string;
}

interface SentinelSpan {
  /** Index of the leading "<<VA". */
  start: number;
  /** Index one past the final ">" (or past the JSON if the terminator is absent). */
  end: number;
  /** The raw JSON object text, braces included. */
  json: string;
}

/**
 * Locate the first sentinel in `text`.
 *
 * Scans the JSON object by brace depth while tracking string literals and
 * escapes, so braces and angle brackets inside `scene` are handled correctly.
 * Returns null when there is no `<<VA` or the object never closes (a truncated
 * stream, in which case there is nothing meaningful to act on).
 */
function findSentinel(text: string): SentinelSpan | null {
  const start = text.indexOf(OPEN);
  if (start === -1) return null;

  // Skip whitespace between "<<VA" and "{" — models sometimes add a space.
  let i = start + OPEN.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      // Only meaningful inside a string, but harmless to flag either way.
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const jsonEnd = i + 1;
        // Consume however many ">" the model emitted (0, 1, 2, or more).
        let end = jsonEnd;
        while (end < text.length && text[end] === ">") end++;
        return { start, end, json: text.slice(start + OPEN.length, jsonEnd).trim() };
      }
    }
  }

  return null;
}

/**
 * Strip every sentinel from a reply string, returning clean text.
 * Idempotent — safe to call on text that has no sentinel.
 */
export function stripVisualActionSentinel(text: string): string {
  let out = text;
  // Loop because a misbehaving model can emit more than one.
  for (;;) {
    const span = findSentinel(out);
    if (!span) break;
    out = out.slice(0, span.start) + out.slice(span.end);
  }
  return out.trim();
}

/**
 * Parse the visual-action payload from a reply string.
 * Returns null if the sentinel is absent or the payload is invalid.
 */
export function parseVisualAction(text: string): VisualActionPayload | null {
  const span = findSentinel(text);
  if (!span) return null;

  let raw: Partial<VisualActionPayload>;
  try {
    raw = JSON.parse(span.json) as Partial<VisualActionPayload>;
  } catch {
    return null;
  }

  if (
    (raw.mode !== "generate" && raw.mode !== "offer") ||
    (raw.mediaType !== "image" && raw.mediaType !== "video") ||
    typeof raw.scene !== "string" ||
    raw.scene.trim().length === 0
  ) {
    return null;
  }

  return {
    mode: raw.mode,
    mediaType: raw.mediaType,
    scene: raw.scene.trim(),
    edit: raw.edit === true,
    aspect: typeof raw.aspect === "string" ? raw.aspect : undefined,
  };
}

/**
 * True if `text` contains anything that looks like the start of a sentinel.
 * Used by the stream route to avoid flushing a partial sentinel to the client
 * mid-stream.
 */
export function hasPartialSentinel(text: string): boolean {
  const idx = text.lastIndexOf("<");
  if (idx === -1) return false;
  const tail = text.slice(idx);
  return OPEN.startsWith(tail.slice(0, Math.min(tail.length, OPEN.length))) || tail.startsWith(OPEN);
}
