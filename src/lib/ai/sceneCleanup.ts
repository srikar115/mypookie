/**
 * Scene cleanup helpers.
 *
 * The chat → image pipeline frequently sees user text that is meant as a
 * COMPLAINT about a previous photo ("but i asked you to be in saree, that's
 * not saree"). Without rewriting, the literal word "not" leaks into the WAN
 * prompt and pushes the model away from what the user actually wanted.
 *
 * `rewriteNegation` converts that kind of phrasing into a positive scene
 * description so downstream prompt builders can use it directly.
 *
 * It is intentionally regex-based — fast, deterministic, and runs synchronously
 * on the hot path (chat stream + image endpoint). The intent router LLM is the
 * primary source of clean scenes; this helper is the safety net.
 */

const COMPLAINT_PREFIXES: RegExp[] = [
  /^\s*but\s+(?:i\s+)?(?:already\s+)?(?:asked|said|told|wanted|wanted you|requested)\s+(?:you\s+)?(?:to\s+(?:be\s+)?)?/i,
  /^\s*i\s+(?:already\s+)?(?:asked|said|told|wanted|requested)\s+(?:you\s+)?(?:to\s+(?:be\s+)?)?/i,
  /^\s*(?:you|that|this)\s+(?:were|are|is|was)\s+(?:supposed\s+to|meant\s+to)\s+(?:be\s+)?/i,
  /^\s*no[,\s]+(?:i\s+)?(?:said|asked|wanted|meant)\s+(?:to\s+(?:be\s+)?)?/i,
  /^\s*(?:um[,\s]+|hey[,\s]+|wait[,\s]+)/i,
];

/**
 * Patterns that mean "the previous photo was wrong, here is what I actually
 * want". When matched, the inner phrase becomes the positive scene.
 */
const NEGATION_RESCUE_PATTERNS: Array<{
  regex: RegExp;
  transform: (m: RegExpMatchArray) => string;
}> = [
  // "that's not X" / "this isn't X" / "it's not X"
  {
    regex:
      /\b(?:that['’]s|this['’]s|that\s+is|this\s+is|it['’]s|it\s+is|you\s+are|you['’]re)\s+(?:not|n['’]t|nt)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z0-9 \-]{2,40}?)(?=[,.!?]|$)/i,
    transform: (m) => m[1].trim(),
  },
  // "I wanted/asked for X" / "I said X"
  {
    regex:
      /\bi\s+(?:wanted|asked\s+for|asked|said|requested|meant)\s+(?:to\s+(?:be|wear|see)\s+)?(?:a\s+|an\s+|the\s+|in\s+(?:a\s+|an\s+|the\s+)?)?([a-z][a-z0-9 \-]{2,40}?)(?=[,.!?]|$)/i,
    transform: (m) => m[1].trim(),
  },
  // "you should be in X" / "you should wear X"
  {
    regex:
      /\byou\s+(?:should|need\s+to|have\s+to|gotta|got\s+to)\s+(?:be\s+(?:in\s+)?|wear|put\s+on|dress\s+in)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z0-9 \-]{2,40}?)(?=[,.!?]|$)/i,
    transform: (m) => m[1].trim(),
  },
];

/**
 * Strip "filler" complaint scaffolding so the remainder reads like a scene.
 * Returns null when stripping produced too little to be useful.
 */
function stripComplaintPrefix(text: string): string {
  let out = text.trim();
  for (const prefix of COMPLAINT_PREFIXES) {
    out = out.replace(prefix, "");
  }
  return out.replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, "").trim();
}

/**
 * Rewrite a possibly-negative or complaint-style user utterance into a
 * positive scene description. Safe to call on any string — if no negation /
 * complaint pattern is present, the trimmed input is returned unchanged.
 */
export function rewriteNegation(input: string | null | undefined): string {
  if (!input) return "";
  const raw = input.trim();
  if (!raw) return "";

  // 1) Try to mine a positive scene from "that's not X" / "I asked for X" / ...
  //    The LATER patterns in the message tend to express what the user wants —
  //    we scan all rescue patterns and pick the LONGEST extracted phrase.
  let best = "";
  for (const { regex, transform } of NEGATION_RESCUE_PATTERNS) {
    const m = raw.match(regex);
    if (m) {
      const candidate = transform(m).trim();
      if (candidate.length > best.length) best = candidate;
    }
  }

  if (best && best.length >= 3) {
    // Prepend a natural framing so the WAN prompt reads like a scene.
    // "saree" → "wearing a saree", but pass through descriptive multi-word
    // phrases ("on the beach") unchanged.
    return framePositive(best);
  }

  // 2) No rescue pattern matched. Strip complaint scaffolding ("but i asked",
  //    "no I said", "um wait") and return the remainder.
  const stripped = stripComplaintPrefix(raw);
  if (stripped && stripped.length >= 3 && stripped !== raw) {
    return stripped;
  }

  // 3) Nothing matched — return the trimmed original.
  return raw;
}

/**
 * Add a light framing verb when the extracted noun is a bare clothing/outfit
 * word so it slots into a generation prompt naturally.
 */
function framePositive(phrase: string): string {
  const p = phrase.replace(/\s+/g, " ").trim();
  const lower = p.toLowerCase();

  // Already framed as a clause — pass through.
  if (
    /^(wearing|dressed|in\s+|on\s+|at\s+|standing|sitting|lying|posing|holding|with\s+)/i.test(p)
  ) {
    return p;
  }

  // Single-word or short noun phrase that reads like an outfit — frame with "wearing".
  const OUTFIT_NOUNS =
    /\b(saree|sari|lehenga|dress|gown|skirt|top|shirt|t[\- ]shirt|jeans|pants|shorts|bikini|swimsuit|lingerie|bra|panties|underwear|kimono|robe|coat|jacket|hoodie|sweater|suit|tuxedo|outfit|costume)\b/i;
  if (OUTFIT_NOUNS.test(lower)) {
    return `wearing a ${p}`;
  }

  // Setting-like noun ("beach", "kitchen", "garden") — frame with "in a".
  const SETTING_NOUNS =
    /\b(beach|garden|kitchen|bedroom|bathroom|balcony|cafe|restaurant|park|forest|mountain|street|office|library|pool|jacuzzi|terrace|rooftop)\b/i;
  if (SETTING_NOUNS.test(lower)) {
    return `at a ${p}`;
  }

  return p;
}

/**
 * Convenience: clean a user-typed message intended to seed an image prompt.
 * Used by the chat stream route when the LLM refused with a content policy
 * error and we need to pre-fill the modal with a positive scene.
 */
export function cleanSceneForPrompt(input: string | null | undefined): string {
  return rewriteNegation(input);
}
