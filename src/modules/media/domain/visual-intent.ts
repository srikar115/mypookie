/**
 * Visual intent classifier — pure regex, no LLM, no server-only imports.
 *
 * The same module is used by the client (ChatConversation) and, optionally,
 * the server (stream route) as a fallback when the model didn't emit a <<VA>>
 * sentinel. No `"server-only"` pragma — same pattern as
 * `src/modules/chat/domain/sanitize-reply.ts`.
 *
 * Thresholds:
 *   < AMBIGUOUS_THRESHOLD  → ambiguous_visual_request (Yes/No clarify bubble)
 *   ≥ AUTO_GENERATE        → auto-generate (high-confidence casual image)
 *   between them           → open MediaComposer
 */

export type VisualIntent =
  | "normal_chat"
  | "image_request"
  | "image_edit_request"
  | "video_request"
  | "video_edit_request"
  | "ambiguous_visual_request";

export interface IntentDecision {
  intent: VisualIntent;
  confidence: number; // 0..1
  mediaType: "image" | "video" | null;
  editMode: boolean;
  requiresReferenceImage: boolean;
  userFacingQuestion: string | null;
  extractedScenePrompt: string;
  suggestedAspectRatio: "portrait" | "landscape" | "square" | null;
  suggestedStyle: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBIGUOUS_THRESHOLD = 0.6;
const AUTO_GENERATE_THRESHOLD = 0.85;
const MAX_CONFIDENCE = 0.98;

// ─── Pattern groups ───────────────────────────────────────────────────────────

/** Hard negation — bail early and return normal_chat. */
const NEGATION_RE =
  /\b(don'?t|do\s+not|not\s+now|never\s*mind|nevermind|no\s+thanks|no\s+need|cancel|forget\s+it)\b/i;

/**
 * Video nouns. Scores +0.7 toward video.
 *
 * "short", "moving", "record", "film", and "movie" used to live here and were
 * removed: they are ordinary English far more often than they are requests
 * ("short on time", "moving house", "for the record", "watch a movie").
 */
const VIDEO_VERBS_RE = /\b(video|clip|reel|animate|animation|footage|gif)\b/i;

/** Continuity edits. Scores +0.92 toward image_edit. */
const CONTINUITY_EDIT_RE =
  /\b(same\s+(outfit|look|pose|background|style|clothes)|change\s+(the\s+)?(background|setting|scene|outfit|clothes)|different\s+(background|angle|pose|setting|scene)|another\s+angle|closer\s+(up|shot)|zoom\s+in|zoom\s+out|from\s+(behind|above|below|the\s+side)|facing\s+(the\s+)?camera|full\s+body|half\s+body|bust\s+shot|close.?up|portrait\s+shot)\b/i;

/**
 * Casual selfie / send-me-a-pic patterns. Scores +0.92 toward image.
 *
 * "one more" now requires a following visual noun ("one more drink" is not a
 * photo request), and "show me your…" requires the complete "yourself" — a
 * bare "show me your <noun>" is handled by the weaker SHOW_VERBS path so
 * "show me your full picture" lands in the composer rather than firing off a
 * generation unreviewed.
 */
const CASUAL_SELFIE_RE =
  /\b(send\s+(me\s+)?(a\s+)?(pic(ture)?|photo|selfie|snap)|(one\s+more|another)\s+(pic(ture)?|photo|selfie|snap)|show\s+(me\s+)?yourself)\b/i;

/** Show verbs (without explicit self-ref). Scores +0.7. */
const SHOW_VERBS_RE =
  /\b(show|send|share|picture\s+of|photo\s+of|selfie|snap|pic(ture)?|image|portrait)\b/i;

/** Edit verbs that require a reference image. */
const EDIT_VERBS_RE =
  /\b(edit|change|update|modify|redo|redo|swap|switch|replace|add\s+(a\s+)?|remove|take\s+off|put\s+on|wearing|dressed|holding)\b/i;

/** Reference-image hints. */
const REFERENCE_HINTS_RE =
  /\b(the\s+(same|previous|last|that)\s+(one|image|photo|picture)|like\s+before|from\s+before|same\s+as\s+last|keep\s+the\s+(same|look))\b/i;

/** Weak visual context — user mentions themselves / you in a short message. */
const WEAK_VISUAL_CONTEXT_RE = /\b(you|yourself|ur|u)\b/i;

// ─── Anchors ──────────────────────────────────────────────────────────────────
//
// Nothing below AMBIGUOUS_THRESHOLD is worth interrupting the conversation
// for, so the classifier is deliberately high-precision: it only engages when
// the message names something visual. Recall is covered by the second
// detection path — the model can still emit a <<VA>> sentinel for phrasings
// the regex deliberately ignores ("let me see you", "I wonder what you're
// wearing"). A missed cue costs nothing; a false positive derails the chat.

/** A concrete visual object. Bare "shot" is excluded — "give it a shot". */
const VISUAL_NOUN_RE =
  /\b(pic|pics|picture|pictures|photo|photos|selfie|selfies|image|images|snap|snapshot|portrait|video|clip|reel|gif|footage)\b/i;

/** Asking for something to be produced or handed over. */
const REQUEST_VERB_RE =
  /\b(show|send|share|give|post|drop|take|snap|make|generate|create|want|wanna|need|lemme|let\s+me|can\s+(i|you)|could\s+(i|you)|will\s+you|would\s+you|how\s+about)\b/i;

/**
 * Unambiguous self-display asks that name no noun. "let me see you" and
 * "see you" are intentionally absent — "see you tonight" is a sign-off, not a
 * photo request.
 */
const SELF_DISPLAY_RE =
  /\b(show\s+(me\s+)?yourself|what\s+do\s+you\s+look\s+like|how\s+do\s+you\s+look)\b/i;

/** "your pic", "a photo of you" — a visual noun bound to the companion. */
const POSSESSIVE_VISUAL_RE =
  /\b((your|ur)\s+(\w+\s+){0,2}(pic|pics|picture|photo|selfie|image|portrait|video|clip)|(pic|picture|photo|selfie|image|portrait|video|clip)s?\s+of\s+(you|u|yourself))\b/i;

/** Portrait aspects — "full picture", "full body", "portrait", "head shot" etc. */
const PORTRAIT_ASPECT_RE =
  /\b(full\s+(body|picture|length|shot)|portrait|head\s+shot|bust\s+shot|from\s+head\s+to\s+toe)\b/i;

/** Wide / landscape hints. */
const LANDSCAPE_ASPECT_RE = /\b(wide\s+shot|landscape|panorama|scenery|background)\b/i;

/** Anime / illustration style. */
const ANIME_STYLE_RE = /\b(anime|manga|illustration|drawn|cartoon|2d|2\.5d)\b/i;

/** Cinematic style. */
const CINEMATIC_STYLE_RE =
  /\b(cinematic|movie|film|dramatic|lens|bokeh|depth\s+of\s+field|shallow\s+focus)\b/i;

// ─── Strip phrases ────────────────────────────────────────────────────────────

const STRIP_PHRASES_RE =
  /\b(show\s+me|send\s+me|show\s+yourself|give\s+me|please|can\s+you|could\s+you|would\s+you|will\s+you|want\s+to\s+see|let\s+me\s+see|can\s+i\s+see|can\s+i\s+get|i\s+want\s+to\s+see|i\s+want|i\s+would\s+like|i'd\s+like|i\s+wanna|wanna\s+see|send\s+me\s+a|send\s+a|show\s+me\s+a|show\s+a)\b/gi;

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyIntent(text: string): IntentDecision {
  const lower = text.trim().toLowerCase();

  // Hard ignore on negation.
  if (NEGATION_RE.test(lower)) {
    return normalChat(text);
  }

  // Gate: the message must actually name something visual before any scoring
  // happens. Without this, ordinary conversation ("are you coming tonight for
  // dinner", "how are you") scored as a weak image request purely for
  // containing the word "you", and the user got a "Want me to send a picture?"
  // prompt mid-sentence.
  const hasVisualNoun = VISUAL_NOUN_RE.test(lower);
  const isSelfDisplay = SELF_DISPLAY_RE.test(lower);
  const isContinuityEdit = CONTINUITY_EDIT_RE.test(lower);
  const isCasualSelfie = CASUAL_SELFIE_RE.test(lower);
  const isVisualAsk =
    isSelfDisplay ||
    isCasualSelfie ||
    isContinuityEdit ||
    (hasVisualNoun &&
      (REQUEST_VERB_RE.test(lower) || POSSESSIVE_VISUAL_RE.test(lower)));
  if (!isVisualAsk) {
    return normalChat(text);
  }

  // Scoring.
  let score = 0;
  let mediaType: "image" | "video" | null = null;
  let editMode = false;

  const isVideo = VIDEO_VERBS_RE.test(lower);
  const hasShowVerb = SHOW_VERBS_RE.test(lower);
  const hasEditVerb = EDIT_VERBS_RE.test(lower);
  const hasReferenceHint = REFERENCE_HINTS_RE.test(lower);
  const hasWeakVisualContext = WEAK_VISUAL_CONTEXT_RE.test(lower);

  if (isVideo) {
    score += 0.7;
    mediaType = "video";
  }

  if (isContinuityEdit) {
    score += 0.92;
    mediaType = mediaType ?? "image";
    editMode = true;
  }

  if (isCasualSelfie) {
    score += 0.92;
    mediaType = mediaType ?? "image";
  }

  if (hasShowVerb && !isCasualSelfie) {
    score += 0.7;
    mediaType = mediaType ?? "image";
  }

  // "what do you look like" — clearly visual, but names no noun the rules
  // above can score. Below the auto threshold so it goes through the composer.
  if (isSelfDisplay && !isCasualSelfie && !hasShowVerb) {
    score += 0.7;
    mediaType = mediaType ?? "image";
  }

  if (hasEditVerb && (hasShowVerb || hasWeakVisualContext)) {
    score += 0.65;
    mediaType = mediaType ?? "image";
    editMode = true;
  }

  // Past the gate with a visual noun but no verb the gate recognised
  // ("your pic?"). Short and self-directed, so treat it as a real ask.
  if (!mediaType && hasVisualNoun) {
    score += VIDEO_VERBS_RE.test(lower) ? 0.7 : 0.65;
    mediaType = VIDEO_VERBS_RE.test(lower) ? "video" : "image";
  }

  // Boosts.
  if (hasEditVerb && mediaType) score += 0.1;
  if (hasReferenceHint && mediaType) score += 0.1;
  if (hasShowVerb && (hasWeakVisualContext || isCasualSelfie)) score += 0.15;

  // Clamp.
  score = Math.min(score, MAX_CONFIDENCE);

  // Not visual at all.
  if (!mediaType || score < 0.1) {
    return normalChat(text);
  }

  // Build scene prompt by stripping trigger phrases.
  const scene = extractScene(text);

  // Detect aspect ratio hints.
  const suggestedAspectRatio: "portrait" | "landscape" | "square" | null =
    PORTRAIT_ASPECT_RE.test(lower)
      ? "portrait"
      : LANDSCAPE_ASPECT_RE.test(lower)
        ? "landscape"
        : null;

  // Detect style hints.
  const suggestedStyle: string | null = ANIME_STYLE_RE.test(lower)
    ? "Anime"
    : CINEMATIC_STYLE_RE.test(lower)
      ? "Cinematic"
      : null;

  // Route by confidence.
  if (score < AMBIGUOUS_THRESHOLD) {
    return {
      intent: "ambiguous_visual_request",
      confidence: score,
      mediaType,
      editMode,
      requiresReferenceImage: editMode || hasReferenceHint,
      userFacingQuestion: "Want me to send a picture for that?",
      extractedScenePrompt: scene,
      suggestedAspectRatio,
      suggestedStyle,
    };
  }

  let intent: VisualIntent;
  if (mediaType === "video") {
    intent = editMode ? "video_edit_request" : "video_request";
  } else {
    intent = editMode ? "image_edit_request" : "image_request";
  }

  return {
    intent,
    confidence: score,
    mediaType,
    editMode,
    requiresReferenceImage: editMode || hasReferenceHint,
    userFacingQuestion: null,
    extractedScenePrompt: scene,
    suggestedAspectRatio,
    suggestedStyle,
  };
}

/**
 * Returns true when the decision requires opening the MediaComposer instead
 * of auto-generating inline. Auto-generation is reserved for high-confidence,
 * non-edit image asks — the rest go through the composer for prompt review.
 */
export function needsCompose(decision: IntentDecision): boolean {
  if (decision.mediaType === "video") return true;
  if (decision.editMode) return true;
  if (decision.confidence < AUTO_GENERATE_THRESHOLD) return true;
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalChat(text: string): IntentDecision {
  return {
    intent: "normal_chat",
    confidence: 0,
    mediaType: null,
    editMode: false,
    requiresReferenceImage: false,
    userFacingQuestion: null,
    extractedScenePrompt: text.trim(),
    suggestedAspectRatio: null,
    suggestedStyle: null,
  };
}

function extractScene(text: string): string {
  return text
    .replace(STRIP_PHRASES_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
