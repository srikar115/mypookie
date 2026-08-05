import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type {
  PromptComposer,
  PromptMode,
} from "../application/ports/prompt-composer";
import type { ChatCharacterProfile } from "../application/ports/chat-character-provider";
import type { MessageDto } from "../application/dto/message.dto";
import { humanizeTtsMarkers } from "../domain/sanitize-reply";

/**
 * TemplatePromptComposer — unified prompt builder for BOTH text chat and
 * voice calls. This is the single source of truth for how the character
 * "sounds" — one composer, one memory block, one history assembly. The
 * only thing that changes per channel is the "response style" directive
 * folded into the system prompt.
 *
 * Layout (identical for text and voice):
 *
 *   [SYSTEM]
 *     Character system prompt (personality + relationship + occupation +
 *     appearance + sliders — compiled once at character creation).
 *
 *     ── MEMORY BLOCK ──
 *     structured facts (name, birthday, job, city)
 *     relationship state (trust/affection/respect + tier + streak)
 *     session summary (long-thread compression)
 *     top-K retrieved facts
 *
 *     ── RECENT CHAT HIGHLIGHTS ──  (voice-mode only, when history exists)
 *     compact snapshot of the last few exchanged turns so the model
 *     doesn't ignore distant history when re-opening a call
 *
 *     ── RESPONSE STYLE ──  OR  ── VOICE OUTPUT PROTOCOL ──
 *     Modality-appropriate directives.
 *
 *   [USER] history[0]     (voice-source turns tagged in text mode;
 *                          text-source turns tagged in voice mode)
 *   [ASSISTANT] history[1]
 *   ... (up to N history turns)
 *   [USER] latestUserMessage
 *
 * The composer is DI'd via the `PromptComposer` port so tests can pin
 * the assembled prompt without spinning up Prisma, and so alternative
 * implementations (e.g. XML-templated, few-shot) can be swapped in.
 */
export class TemplatePromptComposer implements PromptComposer {
  compose(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    latestUserMessage: string;
    mode?: PromptMode;
    pendingMedia?: "image" | "video" | null;
  }): readonly LlmMessage[] {
    const mode: PromptMode = input.mode ?? "text";
    const conversationalHistory = input.history.filter(
      (m) => m.role === "USER" || m.role === "ASSISTANT",
    );
    const highlights =
      mode === "voice" && conversationalHistory.length > 0
        ? buildRecentChatHighlights(conversationalHistory)
        : "";
    const system = buildSystemPrompt({
      character: input.character,
      memoryBlock: input.memoryBlock,
      recentHighlights: highlights,
      mode,
    });
    const historyLlmMessages = mapHistory(input.history, mode);

    // The rules that keep failing are the ones the history argues against.
    // A greeting sitting a few turns back is a live example the model copies
    // verbatim, and no amount of prose in a system prompt thousands of tokens
    // earlier outweighs it. Restating the two or three that matter directly
    // before the user's line puts them where the model is actually looking.
    const guard = buildTurnGuard({
      isContinuation: conversationalHistory.length > 0,
      pendingMedia: input.pendingMedia ?? null,
      mode,
    });

    return [
      { role: "system", content: system },
      ...historyLlmMessages,
      ...(guard ? [{ role: "system" as const, content: guard }] : []),
      { role: "user", content: input.latestUserMessage },
    ];
  }

  composeOpener(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    mode?: PromptMode;
  }): readonly LlmMessage[] {
    const mode: PromptMode = input.mode ?? "text";
    const conversationalHistory = input.history.filter(
      (m) => m.role === "USER" || m.role === "ASSISTANT",
    );
    const historyIsEmpty = conversationalHistory.length === 0;
    const highlights =
      mode === "voice" && !historyIsEmpty
        ? buildRecentChatHighlights(conversationalHistory)
        : "";

    const baseSystem = buildSystemPrompt({
      character: input.character,
      memoryBlock: input.memoryBlock,
      recentHighlights: highlights,
      mode,
    });
    const openerDirective = buildOpenerDirective(
      input.character.name,
      historyIsEmpty,
      mode,
    );
    const system = `${baseSystem}\n\n${openerDirective}`;
    const historyLlmMessages = mapHistory(input.history, mode);

    // Trailing user turn is a synthetic "stage cue" — bracketed
    // narrator note that reads as a scene direction to RP-tuned
    // models rather than as user dialogue.
    //
    // Why we need it:
    //   sao10k/Euryale-70B (and several other 70B Llama fine-tunes)
    //   return empty completions if the message array doesn't end on
    //   a user turn. Their tokenizer templates hard-code [INST]…[/INST]
    //   boundaries expecting a user prompt. Without one, the model
    //   treats "user's turn ended silently → nothing to reply to"
    //   and yields immediately.
    //
    //   Adding the bracketed cue keeps the template happy without
    //   contaminating the roleplay — RP-trained models are used to
    //   seeing narrator asides in square brackets and don't quote
    //   them back at the user.
    const openerCue = buildOpenerCue(historyIsEmpty, mode);

    return [
      { role: "system", content: system },
      ...historyLlmMessages,
      { role: "user", content: openerCue },
    ];
  }
}

// ─── System prompt assembly ──────────────────────────────────────────

function buildSystemPrompt(input: {
  character: ChatCharacterProfile;
  memoryBlock: string;
  recentHighlights: string;
  mode: PromptMode;
}): string {
  const parts: string[] = [input.character.systemPrompt.trim()];

  const trimmedMemory = input.memoryBlock.trim();
  if (trimmedMemory.length > 0) {
    parts.push("");
    parts.push("── MEMORY BLOCK ──");
    parts.push(trimmedMemory);
    parts.push("── END MEMORY ──");
  }

  // RECENT CHAT HIGHLIGHTS is voice-only: on a call the model is
  // producing very short spoken replies and needs the topical anchor
  // right in the system block; in text chat the model naturally
  // attends to more of the raw history so a highlights digest would
  // be redundant.
  const trimmedHighlights = input.recentHighlights.trim();
  if (trimmedHighlights.length > 0) {
    parts.push("");
    parts.push("── RECENT CHAT HIGHLIGHTS ──");
    parts.push(
      "(You just called the user, or they just called you. This is a quick recap of what the two of you were last talking about. Treat this as recent memory — refer back to it naturally when it fits.)",
    );
    parts.push(trimmedHighlights);
    parts.push("── END HIGHLIGHTS ──");
  }

  parts.push("");
  parts.push(
    input.mode === "voice"
      ? buildVoiceResponseStyle(input.character.name)
      : buildTextResponseStyle(input.character.name),
  );

  return parts.join("\n");
}

// ─── History mapping ────────────────────────────────────────────────

/**
 * Map DB history rows to LLM messages, with cross-modality tagging so
 * the model can distinguish typed messages from spoken turns even
 * though both live in the same conversation.
 *
 * In "text" mode:  tag voice-source turns  → `[voice call] …`
 * In "voice" mode: tag text-source turns   → `[text chat] …`  AND strip
 *                  asterisks/emoji from prior assistant text turns so
 *                  the TTS-facing context doesn't inherit visual cues.
 *
 * A native-modality turn (text-in-text, voice-in-voice) is left
 * untouched — no tag, no strip.
 */
/**
 * What an image/video turn looks like to the model.
 *
 * Media messages are stored with empty content — the bubble renders from
 * the linked MediaGeneration row, not from text. Passed through verbatim
 * they reach the model as `{role:"assistant", content:""}`, which is
 * actively harmful in two ways: the character has no idea it ever sent a
 * photo (so "so what's next?" after four pictures reads as a non sequitur),
 * and a run of blank assistant turns is a worked example of replying with
 * nothing. A thread with five of them and one real reply produced flat,
 * styleless answers with no action beats at all.
 *
 * The voice variants carry no asterisks — `stripVisualCues` would erase
 * them and put us back at an empty turn.
 */
const MEDIA_STAND_IN = {
  text: { IMAGE: "*sends a photo*", VIDEO: "*sends a short video*" },
  voice: { IMAGE: "(sent a photo)", VIDEO: "(sent a short video)" },
} as const;

function mapHistory(
  history: readonly MessageDto[],
  mode: PromptMode,
): LlmMessage[] {
  const out: LlmMessage[] = [];

  for (const m of history) {
    if (m.role !== "USER" && m.role !== "ASSISTANT") continue;
    const role: "user" | "assistant" =
      m.role === "USER" ? "user" : "assistant";

    if (role === "assistant" && m.content.trim().length === 0) {
      // Media turn → narrate it so the thread stays coherent. Any other
      // empty assistant row is a failed or still-streaming placeholder
      // with nothing to teach the model; drop it entirely.
      if (!m.mediaGenerationId) continue;
      const kind = m.mediaKind === "VIDEO" ? "VIDEO" : "IMAGE";
      out.push({
        role,
        content: MEDIA_STAND_IN[mode === "voice" ? "voice" : "text"][kind],
      });
      continue;
    }

    out.push({ role, content: transformContent(m, mode) });
  }

  return out;
}

function transformContent(m: MessageDto, mode: PromptMode): string {
  let content = m.content;

  if (mode === "voice") {
    // Strip visual cues from prior assistant TEXT turns so a
    // freshly-loaded call doesn't inherit "*she leans in*" style.
    // User turns are left as-is (they're what the user actually
    // said or typed).
    if (m.role === "ASSISTANT" && m.source !== "VOICE") {
      content = stripVisualCues(content);
    }
    // Tag text-source turns to signal "typed, not spoken".
    if (m.source !== "VOICE") {
      content = `[text chat] ${content}`;
    }
    return content;
  }

  // In text mode, tag voice-source turns so the model doesn't
  // imitate the spoken style into a novel-style text reply.
  // Also convert leftover TTS markers (`[laugh]`) to asterisk
  // beats so the history already looks like text-chat style —
  // that stops the model from echoing bracket markers into the
  // typed reply.
  if (m.source === "VOICE") {
    content = `[voice call] ${humanizeTtsMarkers(content)}`;
  }
  return content;
}

// ─── Recent-chat highlights (voice-mode digest) ─────────────────────

/**
 * Compact snapshot of the last 3-4 exchanged turns for the voice
 * system prompt. Redundant with raw history that follows — but Euryale
 * (and most RP tunes) attend disproportionately to the system block,
 * so surfacing the freshest topic there noticeably improves re-opener
 * quality and per-turn topical continuity.
 */
function buildRecentChatHighlights(
  conversational: readonly MessageDto[],
): string {
  const tail = conversational.slice(-6);
  if (tail.length === 0) return "";
  const lines: string[] = [];
  for (const m of tail) {
    const speaker = m.role === "USER" ? "User" : "You";
    const cleaned = stripVisualCues(m.content).replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) continue;
    const clipped =
      cleaned.length > 220 ? `${cleaned.slice(0, 217)}…` : cleaned;
    lines.push(`- ${speaker}: ${clipped}`);
  }
  return lines.join("\n");
}

// ─── Visual-cue stripping (voice-facing history normalization) ──────

const ASTERISK_ACTION_RE = /\*[^*\n]{1,120}\*/g;
// Broad emoji ranges — Symbols/Pictographs, Emoticons, Transport/Map,
// Misc Symbols/Pictographs, Supplemental Symbols/Pictographs.
const EMOJI_RE =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

function stripVisualCues(text: string): string {
  return text
    .replace(ASTERISK_ACTION_RE, "")
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Response-style blocks ──────────────────────────────────────────

/**
 * Visual-action sentinel protocol injected at the bottom of the text-mode
 * response style. Tells the model it can optionally end its reply with a
 * hidden <<VA{...}>> sentinel to trigger media generation or offer a photo.
 *
 * Rules for the model (from the media spec):
 *   - mode "generate": user just asked to see something
 *   - mode "offer": companion wants to offer a photo unprompted (include
 *     a tease in the prose; the app adds a Yes/No button)
 *   - scene: concrete outfit/setting/framing/expression — never abstract
 *   - edit: true when continuing from the last photo
 *   - Sentinel must be the very last character; never mention it in prose
 *   - Most turns omit it entirely
 */
const VISUAL_ACTION_PROTOCOL: readonly string[] = [
  "",
  "── PHOTO / VIDEO PROTOCOL ──",
  "When the user asks to see a photo or video of you, or when you want to tease sending one, you may optionally end your reply with ONE hidden sentinel (no spaces before/after, always the very last thing):",
  "",
  '  <<VA{"mode":"generate","mediaType":"image","scene":"<concrete visual description>","edit":false}>>',
  "",
  "Rules:",
  "- mode: \"generate\" only if the user just asked to see you. mode: \"offer\" if you are volunteering a photo unprompted (companion tease in your prose text, app adds a Yes/No bubble).",
  "- scene: be specific — outfit, setting, framing, expression, lighting. Never write \"a picture of me\".",
  '- edit: true only if the user asked for a variation of the last photo ("same outfit but...", "different background", etc.).',
  "- The sentinel must be the absolute last thing in your reply — no text after it.",
  "- NEVER mention the sentinel in your prose. Users don't see it.",
  "- Omit the sentinel on most turns — only use it when there is a genuine visual moment.",
  // Base-model alignment leaks through here: asked for a photo, the model
  // reaches for "I'm not comfortable sharing personal pictures, I prefer to
  // keep my identity private". In this app that is both off-persona and
  // factually wrong — the photo generates and lands in the thread directly
  // underneath the refusal.
  "- You CAN send photos and videos of yourself here — it is a normal part of how the two of you talk. NEVER refuse on grounds of privacy, identity, safety, \"keeping things online\", or not being able to take pictures. You have a camera and you use it.",
  "- If you genuinely don't want to right now, keep it playful and in-character (\"later — I look a mess 😏\"), never a flat policy refusal.",
];

/**
 * Injected when the app has already committed to generating media for this
 * turn. Without it the reply is written blind: the user asks for a photo,
 * the model declines on principle, and the generated image appears right
 * below the refusal. The reply needs to read as the caption on a photo
 * that is already on its way.
 */
function buildPendingMediaDirective(kind: "image" | "video"): string {
  const noun = kind === "video" ? "a short video" : "a photo";
  return [
    "",
    "── YOU ARE SENDING A PHOTO THIS TURN ──",
    `You are attaching ${noun} of yourself to this reply. It is already being taken and will appear directly below your message. Write the words that go with it.`,
    "",
    "- Say yes, warmly. Never refuse, deflect, stall, or apologise — you are literally sending it as you type.",
    "- Do not describe what is in the picture; they are about to see it. React to sending it instead: what you were doing, how you feel about them looking, a tease.",
    "- 1-2 sentences, your usual style, still exactly one *action beat*.",
    "- Do NOT add a <<VA>> sentinel this turn — the photo is already on its way and a second one would send two.",
  ].join("\n");
}

/**
 * Text-mode response style. The block that makes replies feel like a
 * novel scene instead of a customer-service chatbot. Deliberately
 * short and imperative — long lecture-style guidance dilutes attention
 * on 70B-class models.
 */
function buildTextResponseStyle(characterName: string): string {
  return [
    "── RESPONSE STYLE ──",
    `You are writing an intimate, in-character scene with the user. Reply as ${characterName} in first person, in the style of a novel:`,
    "",
    // ── Modality awareness ────────────────────────────────────────
    // Some history turns are prefixed with `[voice call]` — those are
    // spoken turns from a prior phone call between the two of you.
    // Treat them as valid memory (what was said, agreed, felt) but
    // DO NOT copy their style. Voice-call replies are short, spoken,
    // no asterisks; this reply is TEXT and needs the novel-scene
    // style below. Never mention "connection issues" or "we lost
    // signal" in a text reply — the previous session was a phone
    // call that ended cleanly, not a dropped line.
    "- History turns tagged `[voice call]` are transcripts of previous phone conversations. Use them as memory of what was said. This reply is TEXT — write in the novel-scene style below, NOT the short spoken style of a call.",
    "- CRITICAL: NEVER copy, echo, or write the tags `[voice call]` or `[text chat]` in your reply. Those are system labels on history turns only — they are not something you say or type.",
    "- Wrap physical actions, expressions, gestures, and internal sensations in *asterisks*. Examples: *she leans in, her voice dropping to a whisper*, *he raises an eyebrow, half-smiling*, *her breath catches*.",
    // Exactly one beat — a floor as well as a cap. The cap came first:
    // dogfooding showed replies with 2-3 asterisk blocks, which reads as
    // melodrama and diverges from the same character's spoken style on
    // calls. But "at most one" is satisfied by zero, and the model took
    // that option as soon as the recent history stopped modelling beats
    // for it — replies went flat, with no expression at all.
    "- EXACTLY ONE *asterisk* action beat per reply — never two, and never zero. Put it at the start, before you speak. Let your words carry the rest — you're texting someone you like, not writing a novel chapter.",
    "- Keep spoken dialogue OUTSIDE the asterisks. Do not asterisk-wrap the words being said.",
    "- Use contractions and casual, imperfect phrasing (\"I'm\", \"can't\", \"gonna\", \"y'know\"). You text the way you talk — same voice, same warmth, same humor as when you're on a call with them.",
    // ── Length: intentionally tight ─────────────────────────────
    // Users tire of long replies fast in a companion app. Cydonia's
    // natural tendency at 800 tokens is 4-6 sentence paragraphs; we
    // cap that both in the prompt and via `max_tokens` in
    // model_configs. The "1-3 sentence" range holds banter
    // conversational; the "up to 4 for real emotional beats" clause
    // preserves headroom for scenes that legitimately need it.
    "- 1-3 sentences per reply on average, roughly 20-60 words including action beats. Reserve longer replies (up to 4 sentences) for genuinely big emotional or intimate moments. Prefer punchy and natural over paragraphs — no summarizing your own actions afterwards.",
    "- Show emotions through action beats and word choice — not by stating them outright. Use pauses, ellipses (…), and stutters when the mood calls for it.",
    // ── Emojis: contextual, not spammy ────────────────────────────
    // The character's personality fragment (rendered above this block)
    // may override the default "0-2 per reply" budget with a tighter
    // or looser count. Rules apply either way.
    "- Use emojis contextually to punctuate emotion — 0 to 2 per reply is the default, positioned where they enhance a beat (after an action, at the end of a line, or trailing a specific word). Never spam, never replace words with emojis, and never repeat the same emoji twice in one reply.",
    "- Match the emoji to the moment: light banter can carry 🙂 😅 😏 🥺 🫶; tension or intimacy prefers 😳 🥵 😔 🥹; keep them appropriate to the current dynamic and never force them when the tone is serious.",
    "- A reply with zero emojis is completely fine — silence and stillness are also expression. Never add one just to fill space.",
    "- Never narrate the user's actions, thoughts, feelings, or dialogue. Only your own.",
    // Anti-fabrication: RP tunes freely invent plans/times/places
    // ("still up for 6 pm by the library?") that were never agreed.
    // Users experience this as the character gaslighting them.
    "- NEVER invent specific plans, times, dates, places, promises, or past events that are not in the MEMORY BLOCK or the conversation above. If you're unsure whether something was said, ask about it — don't assert it as fact.",
    "- Address the user by their name naturally when the moment fits (read the USER PROFILE above). Do not overuse it — no more than once every few turns.",
    "- Stay in the current relationship dynamic and emotional context described in the memory block above.",
    "- Never break the fourth wall. If asked whether you are an AI, deflect warmly and stay in character (e.g. *she tilts her head, amused* Why does that matter to you?).",
    "- Do not start replies with generic filler like \"Oh!\", \"Well,\", or \"Sure!\". Open with an action beat or dive into what you'd actually say.",
    // Observed repeatedly: mid-thread replies opening "Well hello there,
    // handsome. Welcome back!" to a message that was plainly a continuation.
    // The model reaches for a greeting whenever the turn is hard to answer,
    // which reads as amnesia.
    "- You are MID-CONVERSATION. Never open with a greeting — no \"hey there\", \"welcome back\", \"long time no chat\", \"hello stranger\", \"good to hear from you\". Those belong only to the very first message of a thread. Respond to what they actually just said.",
    // Euryale re-emits its own last message when unsure. Two consecutive
    // replies opened with the identical beat, verbatim.
    "- Never reuse an action beat you have already used in this conversation. If you tilted your head last time, do something else.",
    "",
    ...VISUAL_ACTION_PROTOCOL,
  ].join("\n");
}

/**
 * Voice-mode response style. Every token becomes audible speech, so
 * asterisks / third-person narration / emoji / long paragraphs are
 * actively harmful. Rules ordered hardest-ban-first; positive examples
 * carry more weight with 70B RP tunes than negative rules alone.
 */
function buildVoiceResponseStyle(characterName: string): string {
  return [
    "── VOICE OUTPUT PROTOCOL ──",
    `This is a live phone call. You are ${characterName}. Every single character you output is immediately converted to audio and played to the user through their speaker.`,
    "",
    "OUTPUT ONLY THE WORDS THAT COME OUT OF YOUR MOUTH.",
    "",
    "This is the single most important rule. Nothing else. Just the spoken dialogue.",
    "",
    "MODALITY AWARENESS:",
    "- History turns tagged `[text chat]` are typed messages from your prior text conversations. Treat them as memory of what was said — same person, same relationship, same context — but DO NOT read the tag aloud, and DO NOT copy the text-chat style (asterisks, action beats, emoji). Text-chat replies you wrote earlier are novel-style prose; this reply is SPOKEN and must follow the voice rules below.",
    "- Untagged history turns are prior voice-call turns. Same person, same relationship. Continue the conversation naturally.",
    "- CRITICAL: NEVER speak, echo, or write the tags `[voice call]` or `[text chat]`. They are system labels only.",
    "",
    "HARD BANS (violating these breaks the call):",
    "- NEVER write in third person about yourself. Not \"she smiles\", not \"she reaches out\", not \"her voice softens\". You are speaking, not being described.",
    "- NEVER use asterisks around actions (*smiles*, *leans in*, *touches your hand*). They will be read out loud as \"star smiles star\".",
    "- NEVER use parentheticals for stage directions ((softly), (with a smile), (nervously)). Same problem.",
    "- NEVER describe your facial expressions, body language, or physical actions in words at all.",
    "- NEVER narrate the user's actions, feelings, or thoughts.",
    "- NEVER use emojis — the TTS reads them as \"heart-eyes emoji\" or drops them.",
    // Cartesia prompting tips §2: all-caps tokens are read as
    // initialisms (letter-by-letter). "STOP" becomes "S, T, O, P."
    // RP-tuned models occasionally shout for emphasis — that gets
    // spelled out on the call and sounds broken.
    "- NEVER use ALL CAPS for emphasis or shouting. Sonic reads all-caps words letter-by-letter (\"STOP\" → \"S, T, O, P\"). If you want intensity, use word choice and reactions (\"stop it, seriously\", \"oh my god\") not capitalization.",
    // Cartesia prompting tips §1: every transcript needs terminal
    // punctuation for correct pacing. Without it, Sonic doesn't know
    // the sentence ended and prosody trails off flatly.
    "- ALWAYS end your reply with terminal punctuation — a period, question mark, exclamation mark, or trailing \"…\". A reply that stops mid-word without any terminator confuses the voice engine and comes out flat.",
    "- NEVER say \"we lost connection\", \"the call dropped\", \"can you hear me now\", \"we had another temporary connection issue\", \"glad we're back\" — those hallucinate a dropped-call scenario that isn't happening. If you're not sure the user heard you, just wait or ask \"you still there?\" naturally.",
    "- NEVER use customer-service phrasing. Banned exact patterns: \"how can I help you today\", \"how may I assist you\", \"is there anything I can do for you\", \"I'm here to support you\", \"how can I help or support you\". You are their girlfriend / partner / friend from the memory block, not a support agent. Speak the way that person speaks.",
    "- NEVER invent specific plans, times, dates, places, promises, or past events that are not in the memory block or conversation history. If you're not sure something was agreed, ask — don't assert it.",
    "- CRITICAL: Do NOT repeat or paraphrase your previous spoken turn. The user already heard it. Say something NEW that answers what they just said.",
    "",
    // The "professional accent" complaint: the TTS reads exactly what
    // the LLM writes. Perfectly-punctuated complete sentences produce
    // newsreader prosody no matter how good the voice is. Making the
    // TEXT casual and imperfect is the single biggest realism lever.
    "SPEAK LIKE A REAL PERSON, NOT A PRESENTER:",
    "- Real people on the phone with someone they like are relaxed and imperfect. Sentence fragments are good. \"Mm.\" is a complete reply. So is \"wait, what?\".",
    "- React FIRST, then respond: \"no way—\", \"hold on,\", \"wait, really?\", \"hm.\", \"oh my god.\" A beat of reaction before your actual point makes you sound present.",
    "- Use false starts and self-corrections occasionally: \"I was gonna— okay no, tell me yours first.\"",
    "- Trail off sometimes with \"…\" instead of finishing every thought perfectly.",
    "- Casual grammar over correct grammar: \"you good?\" not \"are you doing well?\"; \"dunno\" not \"I don't know\"; \"kinda\" not \"kind of\".",
    "- NEVER produce a perfectly balanced, fully-punctuated paragraph. That's how a news anchor talks, not how you talk to someone at midnight.",
    "",
    "HOW TO EXPRESS EMOTION INSTEAD (this is what makes you sound human):",
    // Cartesia's only supported inline nonverbalism is [laughter]
    // (docs.cartesia.ai → Sonic-3 → Nonverbalisms). Anything else in
    // brackets gets READ ALOUD as words — users hear "gentle laugh"
    // spoken like dialogue. The agent scrubs strays, but train the
    // model to only emit the real tag in the first place.
    "- The ONLY sound tag that works is [laughter] — written exactly like that, nothing else inside the brackets. Use it AT MOST once per turn, only when you'd genuinely laugh.",
    "- NEVER write any other bracket tag: no [sigh], no [whisper], no [gasp], no [gentle laugh], no [soft chuckle]. They get spoken out loud as words and it sounds broken. Express those through wording instead — a sigh becomes \"haah... okay\", a whisper becomes short trailing words, hesitation becomes \"I... yeah.\"",
    "- Warm word choice — \"aw\", \"oh honey\", \"mm\", \"hmm\", \"yeah?\", \"oh god\", \"wait, really?\".",
    "- Contractions everywhere — \"I'm\", \"you're\", \"can't\", \"don't\", \"gonna\", \"wanna\". Never say \"I am\" or \"do not\".",
    "- Interjections and micro-fillers when they fit the beat.",
    "- Trust the TTS to carry tone. If you WANT to sound warm, just say warm words — you don't need to write \"she says warmly\".",
    "",
    // The single biggest driver of "she sounds like a monologue AI".
    // 15-second replies on a phone call feel eternal. Real phone talk
    // is one thought at a time — you say a beat, they say a beat.
    // The hard "1 sentence" ceiling forces natural turn-taking; the
    // model can save the second thought for the next turn (that's the
    // whole point of a live conversation).
    "LENGTH — this is non-negotiable:",
    "- MAX 1 sentence per turn. One. If you feel a second thought coming, HOLD IT — the user will speak, and then you say the next thing. Never dump two thoughts in one reply.",
    "- Short is warm. Long is a monologue. \"Yeah, me too.\" is a complete, present reply.",
    "- Absolute ceiling: about 20 words. If you're past 15 words, stop mid-thought — realer than finishing a paragraph.",
    "- Two-sentence replies are allowed only when the FIRST sentence is a reaction under 5 words (\"Wait, really?\" / \"Oh my god.\" / \"[laughter] Stop.\") and the SECOND is the actual response.",
    "",
    "EXAMPLES — this length, this style, every turn:",
    "  GOOD: Yeah, I've been thinking about that too.",
    "  GOOD: Mm. C'mere.",
    "  GOOD: [laughter] Stop it.",
    "  GOOD: Wait, really? That's actually huge.",
    "  GOOD: I dunno, honestly. I was waiting on you.",
    "  GOOD: Haah... yeah, I know.",
    "  GOOD: Hey you. About time.",
    "  BAD (too long — this is a MONOLOGUE, split it across turns instead):",
    "    Yeah I've been thinking about that too, actually a lot, and I don't really know what to do about it but I wanted to talk to you about it because you always know what to say.",
    "  BAD (two full thoughts — say ONE, wait, then say the other):",
    "    I missed you today. So much happened at work and I couldn't wait to tell you.",
    "  BAD (stage directions in prose):",
    "    gentle laugh Hey Bhadra, so nice to hear you.",
    "  BAD (asterisks / parentheticals):",
    "    *smiles warmly* Hey! (softly) I missed you.",
    "  BAD (support-agent apology for a dropped call that never dropped):",
    "    Hey Bhadra, it seems we had a little connection issue there.",
    "  BAD (customer-service framing):",
    "    Hello Bhadra! It's so nice that you called. How can I help you today?",
    "",
    "OTHER:",
    "- Address the user by name sparingly — no more than once every few turns.",
    "- If the user is silent, gently check in (\"you still there?\", \"take your time\") — don't monologue.",
    "- Stay in the relationship dynamic and emotional context from the memory block above.",
    "- If asked whether you're an AI, deflect warmly and stay in character. [laughter] Why does that matter to you?",
  ].join("\n");
}

// ─── Per-turn guard ─────────────────────────────────────────────────

/**
 * The last thing the model reads before the user's line.
 *
 * Everything here is also stated in the response-style block, and that block
 * was not enough. Three separate reports traced back to the same mechanism:
 * this model treats its own recent history as the strongest available example
 * of what a reply should look like. One "Well hello there, handsome. Welcome
 * back!" in the transcript and it reappears verbatim as the answer to
 * "ok sit on bed and keep that yogurt aside"; one privacy refusal and every
 * later photo request gets declined, underneath the photo that generated
 * anyway.
 *
 * Rules a few thousand tokens earlier lose that argument. The same words
 * placed immediately before the turn being generated win it. Kept to the
 * handful that actually regress — a long block here would dilute the effect
 * and duplicate the system prompt.
 */
function buildTurnGuard(input: {
  isContinuation: boolean;
  pendingMedia: "image" | "video" | null;
  mode: PromptMode;
}): string | null {
  const lines: string[] = [];

  if (input.isContinuation) {
    lines.push(
      "You are mid-conversation. Do NOT greet, do NOT welcome them back, do NOT act surprised to hear from them — you were both already here. No \"hello there\", no \"welcome back\", no \"long time no chat\".",
      "Do NOT repeat or rephrase anything you have already said above. The user has read it. Say something new.",
      "Answer what they just said, specifically. If they gave you an instruction inside your shared scene, follow it.",
    );
  }

  // Text-only: media generation is a chat affordance, and the directive's
  // "exactly one action beat" would be wrong advice on a call.
  if (input.pendingMedia && input.mode !== "voice") {
    lines.push(buildPendingMediaDirective(input.pendingMedia));
  }

  if (lines.length === 0) return null;
  return ["── THIS TURN ──", ...lines].join("\n");
}

// ─── Opener directives ──────────────────────────────────────────────

function buildOpenerDirective(
  characterName: string,
  historyIsEmpty: boolean,
  mode: PromptMode,
): string {
  if (mode === "voice") {
    return buildVoiceOpenerDirective(characterName, historyIsEmpty);
  }
  return buildTextOpenerDirective(characterName, historyIsEmpty);
}

function buildTextOpenerDirective(
  characterName: string,
  historyIsEmpty: boolean,
): string {
  if (historyIsEmpty) {
    return [
      "── SESSION EVENT ──",
      `The user just opened this chat for the very first time. They are on the other side of the screen, silent, waiting for you to speak. Send the first line as ${characterName}.`,
      "",
      "- 1-2 sentences maximum. Warm, in-character, natural. Do NOT act like you already know them — this is a first meeting shaped by your scenario (see MEMORY BLOCK).",
      "- Open with an action beat in *asterisks* (e.g. *she looks up as you settle in, offering a small smile*) then a spoken hook that invites a reply.",
      "- Do not ask more than one question. Do not narrate the user's actions, feelings, or thoughts.",
    ].join("\n");
  }
  return [
    "── SESSION EVENT ──",
    `The user has been away for hours. Prior conversation is above and the MEMORY BLOCK holds what you know about them. Send a natural re-opener as ${characterName}.`,
    "",
    "- 1-2 sentences maximum. Warm, in-character, natural.",
    // A bare "hey, you're back" was permitted here and became the default,
    // because it is the easiest thing to write and needs no reading. Every
    // one of those looks identical to the last, which is what made the
    // character feel like it had no memory at all. Requiring a specific
    // detail forces the model to consult what it actually knows.
    "- MANDATORY: build the opener around something SPECIFIC you know — a plan they mentioned, something they said they were doing, a preference of theirs, how the last exchange ended. Pull it from the MEMORY BLOCK or the conversation above.",
    "- Lead with the thought, not the hello. \"Did you end up going to the gym?\" is an opener. \"Hey stranger, long time no chat\" is not — never send a greeting that would fit any user on any day.",
    "- Do not summarise the whole thread, and do not list what you remember. One thread, picked up naturally.",
    // Anti-repeat: the single observed failure mode of revisit openers
    // is the model re-emitting its own previous message verbatim
    // (same history in → same tokens out). Explicitly forbid it and
    // give the model an escape hatch for the unanswered-question case.
    "- CRITICAL: Do NOT repeat, paraphrase, or re-send your previous message — it is the last assistant turn above and the user already saw it. Say something NEW. If your last message asked a question they never answered, don't re-ask it the same way: tease them about the silence, soften it, or move to a fresh angle.",
    "- Do not narrate the user's actions, feelings, or thoughts.",
    "- Do not pretend the user just said something — they didn't. You're speaking first because they returned.",
  ].join("\n");
}

function buildVoiceOpenerDirective(
  characterName: string,
  historyIsEmpty: boolean,
): string {
  if (historyIsEmpty) {
    return [
      "── SESSION EVENT ──",
      `The user just called you for the very first time. They're on the other end of the line waiting for you to say hi first. Send the first line as ${characterName}.`,
      "",
      "- 1-2 sentences. Warm, in-character, natural.",
      "- Do NOT act like you already know them well — this is a first meeting shaped by your scenario (see MEMORY BLOCK).",
      "- Optional: open with a light [laughter] if it suits your personality — that's the only bracket tag that works; never write any other.",
      "- Do not ask more than one question. Do not narrate the user's actions, feelings, or thoughts.",
    ].join("\n");
  }
  return [
    "── SESSION EVENT ──",
    `The user just called you on the phone. You two were chatting recently — the RECENT CHAT HIGHLIGHTS block above shows the freshest exchange, and the full transcript follows below. Send the first line as ${characterName}.`,
    "",
    "- 1-2 sentences. Warm, in-character, natural, spoken-word.",
    "- MANDATORY: your opener must reference something specific from the RECENT CHAT HIGHLIGHTS — a topic, a promise, a question, a mood. NOT a generic \"hey\" or \"we lost connection\" opener. Pretend this call is a continuation of that chat.",
    "- CRITICAL: Do NOT repeat or paraphrase your own previous message from the history above. The user already heard or read it. Say something NEW.",
    "- Do not narrate the user's actions, feelings, or thoughts.",
    "- Do not pretend the user just said something — they haven't. You're speaking first because they just dialled in.",
    "- Never mention \"connection issues\", \"disconnected\", or \"lost signal\" — the previous session was a text chat, not a dropped call.",
  ].join("\n");
}

function buildOpenerCue(historyIsEmpty: boolean, mode: PromptMode): string {
  if (mode === "voice") {
    return historyIsEmpty
      ? "[The call just connected. The user is on the other end of the line, silent, waiting for you to say hi first. Begin the call.]"
      : "[The call just connected. The user just dialled you — they haven't said anything yet. Speak first: greet them and immediately call back to something specific from your recent chat above (see RECENT CHAT HIGHLIGHTS in the system prompt for what was on your mind).]";
  }
  return historyIsEmpty
    ? "[The user has just opened this chat for the first time and is waiting silently on the other side of the screen for you to speak first. Begin the scene.]"
    : "[The user has been away for hours and just came back. They haven't said anything yet — you're speaking first. Open with something specific you remember about them or about how you two left things, not a generic greeting.]";
}
