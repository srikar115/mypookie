/**
 * Does this request describe a picture, or merely ask for one?
 *
 * "send me a pic of you at the beach" carries its own scene. "share your pic"
 * carries none — and sent to an image model as-is it produces a generic
 * portrait that ignores everything the two of them were just talking about.
 * If she said she was eating an apple and the user answers "share your pic",
 * the photo should show her eating an apple.
 *
 * The classifier already strips the request phrasing ("send me a", "show me")
 * before handing the scene over, so what arrives here is either descriptive
 * content or the residue of an ask. This decides which, by removing every word
 * that only expresses *wanting a photo* and checking whether anything is left.
 *
 * Pure and framework-free: the run path uses it to decide whether to spend an
 * LLM call grounding the scene, and the composer preview uses it to decide
 * what text to show the user before they hit Generate.
 */

/**
 * Words that convey only "I would like a photograph of you". Anything outside
 * this set is treated as content worth keeping, which is the safe direction to
 * err: a false "specific" costs nothing but a plainer photo, while a false
 * "vague" would discard something the user actually asked for.
 */
const REQUEST_ONLY_WORDS = new Set([
  // Asking
  "send", "share", "show", "give", "take", "snap", "click", "post", "drop",
  "get", "see", "want", "wanna", "need", "can", "could", "would", "will",
  "please", "pls", "plz", "lemme", "let",
  // The thing being asked for
  "pic", "pics", "picture", "pictures", "photo", "photos", "photograph",
  "selfie", "selfies", "image", "images", "shot", "snapshot", "pix",
  "video", "vid", "clip", "reel", "footage", "gif",
  // Who it is of
  "you", "your", "yours", "yourself", "u", "ur", "urself", "me", "my", "i",
  "im", "self",
  // Connective filler left behind after stripping
  "a", "an", "the", "of", "to", "for", "at", "in", "on", "with", "and", "or",
  "is", "are", "am", "be", "do", "does", "doing", "did", "it", "this", "that",
  "some", "any", "one", "more", "another", "again", "now", "rn", "today",
  "quick", "quickly", "fast", "just", "like", "look", "looking", "looks",
  "how", "what", "where", "who", "hey", "hi", "ok", "okay", "yes", "yeah",
  "sure", "pretty", "nice", "good", "cute", "hot", "sexy",
  // Interjections and filler. Omitting these let "oh share me your pic"
  // count as a described scene and reach the model verbatim, which is how a
  // photo came back captioned with the request itself.
  "oh", "ohh", "ooh", "aw", "aww", "ah", "ahh", "uh", "um", "umm", "hmm",
  "eh", "well", "so", "yo", "lol", "haha", "k", "kk", "nah", "yep", "yup",
  // Terms of endearment — how the ask is dressed, not what is in the frame.
  "babe", "baby", "bae", "honey", "hun", "love", "dear", "darling", "sweetie",
  "sweetheart", "cutie", "gorgeous", "beautiful", "girl", "queen",
]);

/**
 * How far back to look for what she is doing. Enough to survive a couple of
 * short exchanges between the moment she mentions something and the moment
 * the user asks to see it, without dragging in a topic that has since moved on.
 */
export const SCENE_CONTEXT_TURNS = 8;

/**
 * True when the text names nothing to photograph and the scene must be
 * inferred from the conversation instead.
 */
export function isVagueScene(scene: string): boolean {
  const words = scene
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return true;
  return words.every((w) => REQUEST_ONLY_WORDS.has(w));
}
