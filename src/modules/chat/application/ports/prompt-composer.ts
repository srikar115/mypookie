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
}
