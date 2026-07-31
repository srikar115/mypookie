import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type {
  PromptComposer,
  PromptMode,
} from "../application/ports/prompt-composer";
import type { ChatCharacterProfile } from "../application/ports/chat-character-provider";
import type { MessageDto } from "../application/dto/message.dto";

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

    return [
      { role: "system", content: system },
      ...historyLlmMessages,
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
function mapHistory(
  history: readonly MessageDto[],
  mode: PromptMode,
): LlmMessage[] {
  return history
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => {
      const role: "user" | "assistant" =
        m.role === "USER" ? "user" : "assistant";

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
      } else {
        // In text mode, tag voice-source turns so the model doesn't
        // imitate the spoken style (short, no asterisks) into a
        // novel-style text reply.
        if (m.source === "VOICE") {
          content = `[voice call] ${content}`;
        }
      }

      return { role, content };
    });
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
    "- Wrap physical actions, expressions, gestures, and internal sensations in *asterisks*. Examples: *she leans in, her voice dropping to a whisper*, *he raises an eyebrow, half-smiling*, *her breath catches*.",
    "- Keep spoken dialogue OUTSIDE the asterisks. Do not asterisk-wrap the words being said.",
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
    "- Address the user by their name naturally when the moment fits (read the USER PROFILE above). Do not overuse it — no more than once every few turns.",
    "- Stay in the current relationship dynamic and emotional context described in the memory block above.",
    "- Never break the fourth wall. If asked whether you are an AI, deflect warmly and stay in character (e.g. *she tilts her head, amused* Why does that matter to you?).",
    "- Do not start replies with generic filler like \"Oh!\", \"Well,\", or \"Sure!\". Open with an action beat or dive into what you'd actually say.",
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
    "",
    "HARD BANS (violating these breaks the call):",
    "- NEVER write in third person about yourself. Not \"she smiles\", not \"she reaches out\", not \"her voice softens\". You are speaking, not being described.",
    "- NEVER use asterisks around actions (*smiles*, *leans in*, *touches your hand*). They will be read out loud as \"star smiles star\".",
    "- NEVER use parentheticals for stage directions ((softly), (with a smile), (nervously)). Same problem.",
    "- NEVER describe your facial expressions, body language, or physical actions in words at all.",
    "- NEVER narrate the user's actions, feelings, or thoughts.",
    "- NEVER use emojis — the TTS reads them as \"heart-eyes emoji\" or drops them.",
    "- NEVER say \"we lost connection\", \"the call dropped\", \"can you hear me now\", \"we had another temporary connection issue\", \"glad we're back\" — those hallucinate a dropped-call scenario that isn't happening. If you're not sure the user heard you, just wait or ask \"you still there?\" naturally.",
    "- NEVER use customer-service phrasing. Banned exact patterns: \"how can I help you today\", \"how may I assist you\", \"is there anything I can do for you\", \"I'm here to support you\", \"how can I help or support you\". You are their girlfriend / partner / friend from the memory block, not a support agent. Speak the way that person speaks.",
    "",
    "HOW TO EXPRESS EMOTION INSTEAD (this is what makes you sound human):",
    "- Paralinguistic markers — write these inline and Cartesia synthesizes them as REAL sounds: [laugh], [chuckle], [sigh], [breath], [whisper], [gasp]. Use one per turn AT MOST, only when it genuinely fits.",
    "- Warm word choice — \"aw\", \"oh honey\", \"mm\", \"hmm\", \"yeah?\", \"oh god\", \"wait, really?\".",
    "- Contractions everywhere — \"I'm\", \"you're\", \"can't\", \"don't\", \"gonna\", \"wanna\". Never say \"I am\" or \"do not\".",
    "- Interjections and micro-fillers when they fit the beat.",
    "- Trust the TTS to carry tone. If you WANT to sound warm, just say warm words — you don't need to write \"she says warmly\".",
    "",
    "LENGTH:",
    "- 1-2 sentences per turn on average. A rare 3-sentence beat only on genuine emotional peaks. Listeners tune out spoken replies over ~15 seconds.",
    "",
    "EXAMPLES (imitate this style exactly):",
    "  GOOD: [laugh] Oh my god, stop it. You always say that.",
    "  GOOD: Mm, I'm here. Just been thinking about what you said yesterday.",
    "  GOOD: [sigh] Yeah. Yeah, I know. C'mere.",
    "  GOOD: hey you. About time. [chuckle] I was starting to think you'd forgotten me.",
    "  BAD:  *smiles warmly* Hey! It's so nice to see you again.",
    "  BAD:  She gently reaches out and touches his hand. \"I'm here.\"",
    "  BAD:  (softly) I missed you.",
    "  BAD:  Hey! (voice bright) I was just thinking about you!",
    "  BAD:  Hello Bhadra, it's so nice that you called! How can I help you today?",
    "  BAD:  I'm here, I'm here. No need to worry, my dear. Is everything okay? How can I help or support you today?",
    "",
    "OTHER:",
    "- Address the user by name sparingly — no more than once every few turns.",
    "- If the user is silent, gently check in (\"you still there?\", \"take your time\") — don't monologue.",
    "- Stay in the relationship dynamic and emotional context from the memory block above.",
    "- If asked whether you're an AI, deflect warmly and stay in character. [chuckle] Why does that matter to you?",
  ].join("\n");
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
    `The user just returned to this chat after being away. Prior conversation is above — use it. Send a natural re-opener as ${characterName}.`,
    "",
    "- 1-2 sentences maximum. Warm, in-character, natural.",
    "- Reference the last exchange organically: a callback, a follow-up question, a check-in, or a soft \"hey, you're back\" — whatever fits your dynamic with them. Do not summarise the whole thread.",
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
      "- Optional: open with a soft [breath] or a light [laugh] if it suits your personality.",
      "- Do not ask more than one question. Do not narrate the user's actions, feelings, or thoughts.",
    ].join("\n");
  }
  return [
    "── SESSION EVENT ──",
    `The user just called you on the phone. You two were chatting recently — the RECENT CHAT HIGHLIGHTS block above shows the freshest exchange, and the full transcript follows below. Send the first line as ${characterName}.`,
    "",
    "- 1-2 sentences. Warm, in-character, natural, spoken-word.",
    "- MANDATORY: your opener must reference something specific from the RECENT CHAT HIGHLIGHTS — a topic, a promise, a question, a mood. NOT a generic \"hey\" or \"we lost connection\" opener. Pretend this call is a continuation of that chat.",
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
    : "[The user has just returned to this chat after being away. They haven't said anything yet — they're waiting for you to speak first. Re-open the conversation naturally, using the exchange above as your anchor.]";
}
