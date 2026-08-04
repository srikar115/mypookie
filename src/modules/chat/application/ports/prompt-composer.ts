import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type { ChatCharacterProfile } from "./chat-character-provider";
import type { MessageDto } from "../dto/message.dto";

/**
 * Which modality the LLM output will be presented through. Drives the
 * response-style block, history-mapping strategy, and opener directive:
 *
 *   - "text"  → novel-style prose with *asterisk* action beats and emojis
 *   - "voice" → spoken dialogue only, no asterisks / no emojis, with
 *               Cartesia paralinguistic markers ([laugh], [sigh], …)
 *
 * ONE composer implementation handles both — the mode flag is what
 * keeps the character consistent across channels. Text and voice see
 * the same character, the same memory, and the same history. Only the
 * "how to speak" instructions differ.
 */
export type PromptMode = "text" | "voice";

/**
 * PromptComposer — builds the exact ChatMessage[] payload the LLM adapter
 * receives. Concentrating this here means:
 *
 *   - system prompt shape is one place to iterate
 *   - the memory block layout is not smeared across the streaming route
 *   - unit tests can pin the assembled prompt without spinning up Prisma
 *   - voice and text are guaranteed to share the same character and memory,
 *     eliminating the drift that plagued the two-composer architecture
 */
export interface PromptComposer {
  compose(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    latestUserMessage: string;
    mode?: PromptMode;
    /**
     * Set when the app has already decided to generate media for this turn.
     * The reply is then written as the caption on a photo the user is about
     * to see, rather than as an independent answer that may contradict it.
     */
    pendingMedia?: "image" | "video" | null;
  }): readonly LlmMessage[];

  /**
   * Variant of `compose` used when the character is initiating the
   * conversation — i.e., the user just opened the chat window (or the
   * call just connected) and hasn't spoken yet. Differs from `compose`
   * in two ways:
   *
   *   1. No final `{ role: "user" }` turn is appended.
   *   2. An "opener directive" is folded into the system prompt so
   *      the model knows to speak first and how to shape the opener
   *      based on whether history exists.
   *
   * Used by /api/chat/:id/opener (text) AND /voice-agent/context with
   * empty utterance (voice call-start).
   */
  composeOpener(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    mode?: PromptMode;
  }): readonly LlmMessage[];
}
