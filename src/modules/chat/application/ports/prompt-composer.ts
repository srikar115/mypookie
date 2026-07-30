import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type { ChatCharacterProfile } from "./chat-character-provider";
import type { MessageDto } from "../dto/message.dto";

/**
 * PromptComposer — builds the exact ChatMessage[] payload the LLM adapter
 * receives. Concentrating this here means:
 *
 *   - system prompt shape is one place to iterate
 *   - the memory block layout is not smeared across the streaming route
 *   - unit tests can pin the assembled prompt without spinning up Prisma
 */
export interface PromptComposer {
  compose(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
    latestUserMessage: string;
  }): readonly LlmMessage[];

  /**
   * Variant of `compose` used when the character is initiating the
   * conversation — i.e., the user just opened the chat window and
   * hasn't spoken yet. Differs from `compose` in two ways:
   *
   *   1. No final `{ role: "user" }` turn is appended.
   *   2. An "opener directive" is folded into the system prompt so
   *      the model knows to speak first and how to shape the opener
   *      based on whether history exists.
   *
   * Used by the /api/chat/:id/opener route. Response is NOT streamed
   * to the client — the whole reply is generated server-side and then
   * revealed atomically, matching the buffered-reveal UX.
   */
  composeOpener(input: {
    character: ChatCharacterProfile;
    memoryBlock: string;
    history: readonly MessageDto[];
  }): readonly LlmMessage[];
}
