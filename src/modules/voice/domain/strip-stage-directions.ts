/**
 * stripStageDirections — pure text scrubber that removes prose stage
 * directions from an assistant's voice-call reply.
 *
 * Cydonia and Euryale are heavily RP-fiction-tuned: even with an
 * aggressive "spoken dialogue only" system prompt they will
 * occasionally slip and emit lines like:
 *
 *   "*she smiles warmly*  Hey Bhadra! It's so nice to see you again."
 *   "she gently reaches out and touches your hand. I'm here."
 *   "(softly) I missed you."
 *
 * Those slips have TWO bad consequences on a phone call:
 *   1. Cartesia reads them out loud in third person → immersion-breaking.
 *   2. The chat transcript persists them as if the character
 *      actually said "star star she smiles warmly star star".
 *
 * We can't retroactively fix #1 (the TTS already spoke), but we can
 * always fix #2 by scrubbing before we write the assistant message to
 * the database. This module owns that scrub.
 *
 * The function is deliberately conservative: it strips only what
 * unambiguously looks like narration, so ordinary dialogue that
 * happens to mention "she" (referring to a third party) survives.
 *
 * @param text raw assistant content from the LLM
 * @returns scrubbed content, or the original if nothing looked like a
 *   stage direction.
 */
// Prose stage-direction prefix at sentence start, no brackets, no
// asterisks — just words: "gentle laugh Hey Bhadra" / "soft sigh Yeah".
// The agent's TTS text transform scrubs these before Cartesia speaks
// them; the same scrub must run here so the persisted chat transcript
// doesn't show what the user never heard.
const PROSE_STAGE_LEAD_RE =
  /(^|[.!?\n]\s+)((?:gentle|soft|light|small|quiet|little|nervous|shy|warm|playful|faint)\s+)?(laugh(?:s|ter|ing)?|chuckles?|giggles?|sighs?|smiles?|nods?|blushes?|winks?|grins?)\b[,.\s]+(?=[A-Za-z])/gi;

// Connection-issue apology sentences ("Seems we had a connection issue
// there.") — these get read aloud on calls as a support-agent apology
// for a dropped call that never dropped. Dropped from persisted chat
// too — the user never actually heard a dropped call.
const FILLER_PHRASE_RE =
  /\b(?:connection|communication|comms?|audio|signal|line)\s+(?:issue|hiccup|problem|glitch|drop|blip|mishap|thing)\b/i;

function isFillerSentence(sentence: string): boolean {
  return (
    FILLER_PHRASE_RE.test(sentence) && sentence.trim().length <= 130
  );
}

export function stripStageDirections(text: string): string {
  if (!text || text.length === 0) return text;

  // 1. Kill asterisk-wrapped actions. `*she smiles*`, `*leans in*`.
  //    Capped at 200 chars so a stray `*` doesn't nuke a paragraph.
  let out = text.replace(/\*[^*\n]{1,200}\*/g, "");

  // 2. Kill short parenthetical stage directions. `(softly)`,
  //    `(with a warm smile)`. Capped at 80 chars so genuine
  //    parenthetical asides in dialogue survive.
  out = out.replace(/\([^()\n]{1,80}\)/g, "");

  // 3. Strip prose stage directions ("gentle laugh Hey Bhadra") at
  //    sentence start, anywhere in the text. Keep the leading
  //    boundary character so sentence spacing survives.
  out = out.replace(PROSE_STAGE_LEAD_RE, (_m, boundary) => boundary ?? "");

  // 4. Walk from the front and strip contiguous narration sentences.
  //    We stop as soon as we hit the first sentence that reads like
  //    real dialogue. Front-only, because slip patterns almost always
  //    start with narration and then transition into speech.
  const sentenceHead = /^\s*([^.!?\n]+[.!?]+)\s*/;
  const maxIterations = 5; // defence against pathological inputs
  for (let i = 0; i < maxIterations; i++) {
    const m = out.match(sentenceHead);
    if (!m) break;
    if (!looksLikeNarrationSentence(m[1]) && !isFillerSentence(m[1])) break;
    out = out.slice(m[0].length);
  }

  // 5. Also strip a narration OR filler sentence RIGHT AFTER a
  //    paragraph break — Cydonia intersperses these between dialogue.
  //    Only ONE pass; conservative.
  out = out.replace(
    /(\n|\.\s+|!\s+|\?\s+)([^.!?\n]{5,200}?[.!?])/g,
    (match, sep, sentence) =>
      looksLikeNarrationSentence(sentence) || isFillerSentence(sentence)
        ? sep
        : match,
  );

  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Narration heuristic: sentence starts with a third-person subject
 * (she/he/they/her/his/their) OR a stage-direction adverb (gently,
 * softly, warmly, …), AND contains at least one common
 * physical/emotional action verb. Both conditions must hold — this
 * keeps ordinary "she said she'd come by" style dialogue safe.
 */
function looksLikeNarrationSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (s.length === 0) return false;

  const NARRATION_VERBS =
    /\b(smiles?|smiling|smiled|laughs?|laughing|laughed|reaches?|reaching|reached|leans?|leaning|leaned|touches?|touching|touched|sighs?|sighing|sighed|blushes?|blushing|blushed|nods?|nodding|nodded|looks? at|looking at|gazes?|gazing|gazed|whispers?|whispering|whispered|shakes?|shaking|shook|tilts?|tilting|tilted|kisses?|kissing|kissed|caresses?|caressing|caressed|strokes?|stroking|stroked|traces?|tracing|traced|glances?|glancing|glanced|winks?|winking|winked|frowns?|frowning|frowned|pouts?|pouting|pouted|grins?|grinning|grinned|chuckles?|chuckling|chuckled|hugs?|hugging|hugged|steps?|stepping|stepped|walks?|walking|walked|sits?|sitting|sat|stands?|standing|stood|takes? a step|takes? your hand|takes? his hand|takes? her hand|places? her|places? his)\b/i;

  const startsWithThirdPerson = /^(she|he|they|her|his|their)\b/i.test(s);
  const startsWithStageAdverb =
    /^(gently|softly|warmly|slowly|carefully|nervously|shyly|playfully|tenderly|quietly|slightly|slowly|hesitantly|eagerly|coyly|sweetly)\b/i.test(
      s,
    );

  if (!(startsWithThirdPerson || startsWithStageAdverb)) return false;
  return NARRATION_VERBS.test(s);
}
