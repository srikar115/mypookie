/**
 * Pure text sanitizers for assistant replies. No "server-only" import on
 * purpose — the client renderer (`MessageText`) reuses these to clean up
 * legacy rows persisted before the sanitizers existed, and live-streamed
 * text that hasn't been finalized server-side yet.
 */

import { stripVisualActionSentinel } from "./visual-action";

/**
 * The prompt composer annotates cross-modality history turns with
 * `[voice call]` / `[text chat]` prefixes so the model can tell spoken
 * turns from typed ones. RP-tuned models occasionally copy that
 * annotation verbatim into their own output ("[voice call] *She sighs*
 * Well…"). Those tags are system metadata, never something the
 * character says — strip every occurrence.
 */
const MODALITY_TAG_RE = /\[\s*(?:voice call|text chat)\s*\]\s*/gi;

export function stripModalityTags(text: string): string {
  return text.replace(MODALITY_TAG_RE, "").trim();
}

/**
 * Cartesia paralinguistic markers → asterisk action beats.
 *
 * On a call the LLM writes markers like `[laugh]` / `[Faint laugh]`
 * inline; the TTS synthesizes them as real sounds. In the chat
 * transcript they'd read as literal bracketed text — but simply
 * deleting them loses the emotion the user actually heard. Instead we
 * convert them to the same *asterisk beat* convention text-chat
 * replies use, so a spoken laugh renders in the same purple italic as
 * a typed `*she laughs*`:
 *
 *   "[laugh] Oh stop it"        → "*laughs* Oh stop it"
 *   "[Faint laugh] Well, I…"    → "*faint laugh* Well, I…"
 *   "[soft sigh] Yeah."         → "*soft sigh* Yeah."
 *
 * Bracketed content that doesn't look like a sound cue (e.g. `[pause]`,
 * stray stage directions) is dropped — brackets are never valid spoken
 * output. Breath markers are dropped too; "*breath*" reads as noise,
 * not emotion.
 */
const SOUND_WORDS =
  /\b(laugh|laughter|laughs|chuckle|giggle|sigh|gasp|whisper|hum|groan|moan|yawn|snort|sniffle|purr)\b/i;

const SINGLE_WORD_VERB: Record<string, string> = {
  laugh: "laughs",
  // `[laughter]` is the one tag Cartesia actually synthesizes, so it's
  // what the prompt now instructs — render it as the plain beat.
  laughter: "laughs",
  laughs: "laughs",
  chuckle: "chuckles",
  giggle: "giggles",
  sigh: "sighs",
  gasp: "gasps",
  whisper: "whispers",
  hum: "hums",
  groan: "groans",
  moan: "moans",
  yawn: "yawns",
  snort: "snorts",
  sniffle: "sniffles",
  purr: "purrs",
};

const BRACKET_MARKER_RE = /\[([^\][\n]{1,40})\]/g;

export function humanizeTtsMarkers(text: string): string {
  return text
    .replace(BRACKET_MARKER_RE, (_full, inner: string) => {
      const cue = inner.trim().toLowerCase();
      if (cue === "breath" || cue === "exhale" || cue === "inhale") return "";
      const verb = SINGLE_WORD_VERB[cue];
      if (verb) return `*${verb}*`;
      if (SOUND_WORDS.test(cue)) return `*${cue}*`;
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

/**
 * Full clean for an assistant reply headed to the chat transcript:
 * modality tags out, TTS markers converted to beats, whitespace tidied,
 * and the visual-action sentinel stripped so it never reaches the UI, TTS,
 * or the DB content column.
 */
export function sanitizeAssistantReply(text: string): string {
  // Strip the <<VA{...}>> sentinel first so downstream regexes don't see it.
  return humanizeTtsMarkers(stripModalityTags(stripVisualActionSentinel(text)));
}
