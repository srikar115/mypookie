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

/**
 * A full narration sentence the model wrapped in square brackets:
 *
 *   "[Ananya sends a playful selfie, tilting her head with a mischievous
 *    smile…] I hope this meets your request, Karthik."
 *
 * The voice protocol bans third-person narration in asterisks and in
 * parentheses; brackets were the one wrapper left unclaimed, and the model
 * found it. Unlike asterisks — which the agent worker strips before Cartesia
 * sees them — brackets go straight through to the voice engine, so the user
 * genuinely heard this read aloud.
 *
 * Which is why it becomes an action beat rather than being deleted: it's the
 * same thing a typed `*she tilts her head*` is, and the transcript should
 * show what happened, in the purple italic that marks an action everywhere
 * else. The length floor keeps this off Cartesia's short cue markers, which
 * the pass below already handles.
 */
const NARRATION_BRACKET_RE = /\[([^\][\n]{41,400})\]/g;

/**
 * Composer cues are bracketed too — `[The user has been away for hours…]`.
 * Those are instructions about the user, not the character doing something,
 * and dressing one up as an action beat would make a prompt leak look
 * deliberate. They get dropped instead.
 */
const PROMPT_CUE_RE = /\bthe user\b/i;

export function humanizeTtsMarkers(text: string): string {
  return text
    .replace(NARRATION_BRACKET_RE, (_full, inner: string) => {
      const narration = inner.trim();
      if (PROMPT_CUE_RE.test(narration)) return "";
      return `*${narration}*`;
    })
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
 * Prompt section headers, e.g. `── THIS TURN ──`, `── RESPONSE STYLE ──`.
 *
 * Written with box-drawing characters (U+2500) rather than dashes precisely
 * so they can be recognised: no character would type one in dialogue. Their
 * appearance in output means the model has started reciting its instructions
 * instead of answering.
 */
const PROMPT_SECTION_RE = /\u2500{2,}\s*[A-Z][A-Z0-9 '’·-]*\s*\u2500{2,}/;

/**
 * Cuts a recited prompt out of a reply.
 *
 * Asked "lets have a call", the model once answered with the verbatim text of
 * its own turn guard followed by the response-style block. The prompt shape
 * that caused it is fixed, but a leak is bad enough — it exposes the system
 * prompt and shatters the character in one move — that it's worth a
 * deterministic net rather than trusting the prompt alone.
 *
 * Everything from the first section header onward goes. If real dialogue came
 * first, it survives; if the reply was nothing but prompt, the caller is left
 * with an empty string, which is a far better outcome than showing it.
 */
export function stripLeakedPrompt(text: string): string {
  const match = PROMPT_SECTION_RE.exec(text);
  if (!match) return text;
  return text.slice(0, match.index).trim();
}

/**
 * Full clean for an assistant reply headed to the chat transcript:
 * recited prompt out, modality tags out, TTS markers converted to beats,
 * whitespace tidied, and the visual-action sentinel stripped so it never
 * reaches the UI, TTS, or the DB content column.
 */
export function sanitizeAssistantReply(text: string): string {
  // Strip the <<VA{...}>> sentinel first so downstream regexes don't see it.
  return humanizeTtsMarkers(
    stripModalityTags(stripLeakedPrompt(stripVisualActionSentinel(text))),
  );
}
