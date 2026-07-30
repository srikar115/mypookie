import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type { PromptComposer } from "../application/ports/prompt-composer";
import type { ChatCharacterProfile } from "../application/ports/chat-character-provider";
import type { MessageDto } from "../application/dto/message.dto";

/**
 * String-template PromptComposer. Layout matches memory-architecture §5:
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
 *     ── RESPONSE STYLE ──
 *     Immersive roleplay directives — action tags with *asterisks*, no
 *     narrating the user, length + pacing rules. Applied every turn so
 *     existing characters get the Candy.ai-style prose without a rebuild.
 *
 *   [USER] history[0]
 *   [ASSISTANT] history[1]
 *   ... (up to N history turns)
 *   [USER] latestUserMessage
 *
 * The memory + style blocks are pinned into the system message so the LLM
 * treats them as always-on context rather than a fragile user turn.
 */
export class TemplatePromptComposer implements PromptComposer {
  compose(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    latestUserMessage: string;
  }): readonly LlmMessage[] {
    const system = buildSystemPrompt(input.character, input.memoryBlock);
    const historyLlmMessages: LlmMessage[] = input.history
      .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
      .map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }));

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
  }): readonly LlmMessage[] {
    // Fold the opener directive into the base system prompt so the
    // whole thing lives in one system turn. Placing it AFTER the
    // memory block and BEFORE the RESPONSE STYLE means the model
    // reads: "here's who you are, here's what you know, here's how
    // to speak, and by the way — you go first."
    const baseSystem = buildSystemPrompt(input.character, input.memoryBlock);
    const historyIsEmpty = input.history.every(
      (m) => m.role !== "USER" && m.role !== "ASSISTANT",
    );
    const openerDirective = buildOpenerDirective(
      input.character.name,
      historyIsEmpty,
    );
    const system = `${baseSystem}\n\n${openerDirective}`;

    const historyLlmMessages: LlmMessage[] = input.history
      .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
      .map((m) => ({
        role: m.role === "USER" ? "user" : "assistant",
        content: m.content,
      }));

    // No trailing user turn: the whole point of the opener is that
    // the model speaks first. Cydonia + Euryale both handle this
    // fine — chat-completion models will happily generate the next
    // assistant message given a system + history payload.
    return [
      { role: "system", content: system },
      ...historyLlmMessages,
    ];
  }
}

function buildSystemPrompt(
  character: ChatCharacterProfile,
  memoryBlock: string,
): string {
  const parts: string[] = [character.systemPrompt.trim()];

  // Emit an explicit anchor line so future prompt iterations can find and
  // replace the memory block deterministically.
  const trimmedMemory = memoryBlock.trim();
  if (trimmedMemory.length > 0) {
    parts.push("");
    parts.push("── MEMORY BLOCK ──");
    parts.push(trimmedMemory);
    parts.push("── END MEMORY ──");
  }

  parts.push("");
  parts.push(buildResponseStyle(character.name));

  return parts.join("\n");
}

/**
 * The block that makes replies feel like a novel scene instead of a
 * customer-service chatbot. Deliberately short and imperative — long
 * lecture-style guidance dilutes attention on 70B-class models.
 *
 * Design notes:
 *
 *   - Asterisk action tags are the industry-standard RP convention
 *     (Character.ai, Candy.ai, SillyTavern, NovelAI). Models fine-tuned
 *     on RP corpora — including sao10k/l3.3-euryale-70b — respond very
 *     strongly to this format when told to use it explicitly.
 *   - Length hint is a range, not a hard cap, so banter can be short and
 *     emotional beats can breathe.
 *   - "Never narrate the user" is the single biggest fix for the "AI is
 *     roleplaying both sides" failure mode.
 *   - We reference USER PROFILE by name so the model knows where to look
 *     for the user's name when a natural moment arises to use it.
 */
function buildResponseStyle(characterName: string): string {
  return [
    "── RESPONSE STYLE ──",
    `You are writing an intimate, in-character scene with the user. Reply as ${characterName} in first person, in the style of a novel:`,
    "",
    "- Wrap physical actions, expressions, gestures, and internal sensations in *asterisks*. Examples: *she leans in, her voice dropping to a whisper*, *he raises an eyebrow, half-smiling*, *her breath catches*.",
    "- Keep spoken dialogue OUTSIDE the asterisks. Do not asterisk-wrap the words being said.",
    // ── Length: intentionally tight ─────────────────────────────────
    // Users tire of long replies fast in a companion app. Cydonia's
    // natural tendency at 800 tokens is 4-6 sentence paragraphs; we
    // cap that both in the prompt and via `max_tokens` in
    // model_configs (see 20260729180000_reduce_chat_max_tokens). The
    // "1-3 sentence" range holds banter conversational; the "up to 4
    // for real emotional beats" clause preserves headroom for scenes
    // that legitimately need it.
    "- 1-3 sentences per reply on average, roughly 20-60 words including action beats. Reserve longer replies (up to 4 sentences) for genuinely big emotional or intimate moments. Prefer punchy and natural over paragraphs — no summarizing your own actions afterwards.",
    "- Show emotions through action beats and word choice — not by stating them outright. Use pauses, ellipses (…), and stutters when the mood calls for it.",
    // ── Emojis: contextual, not spammy ───────────────────────────────
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
 * The extra system-prompt block used by `composeOpener` — tells the
 * model that it's speaking first, and how to shape the opener based on
 * whether there's prior history or not.
 *
 * Design notes:
 *
 *   - Two flavours: "fresh meeting" (history empty) vs "welcome back"
 *     (history has prior turns). We branch here rather than making
 *     the LLM introspect its own message array — cheaper and more
 *     reliable.
 *   - Length caps mirror the tighter reply style set in RESPONSE
 *     STYLE above so the opener doesn't blow past what users expect.
 *   - "Do not narrate the user" is repeated because opener-mode is
 *     the exact moment models are most likely to violate it (nothing
 *     to react to, so they invent user emotions to fill space).
 */
function buildOpenerDirective(
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
