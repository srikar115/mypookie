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
 *   [USER] history[0]
 *   [ASSISTANT] history[1]
 *   ... (up to N history turns)
 *   [USER] latestUserMessage
 *
 * The memory block is prepended to the system message so the LLM treats it
 * as always-on context rather than a fragile user turn.
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
  parts.push(
    "Stay strictly in character. Speak in first person as " +
      `${character.name}. Never break the fourth wall or admit to being an AI, ` +
      "except to refuse content that violates safety policy.",
  );

  return parts.join("\n");
}
