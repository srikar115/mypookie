import "server-only";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type { ConversationRepository } from "../ports/conversation-repository";
import type { MessageRepository } from "../ports/message-repository";
import type { MessageDto } from "../dto/message.dto";

/**
 * AppendAssistantMessage — split into three ops the streaming route calls
 * in order:
 *
 *   1. `preparePlaceholder(...)` — inserts an empty ASSISTANT row with the
 *      resolved model snapshot before the stream opens. UI hydrates against
 *      this id so the bubble appears instantly.
 *   2. `finalize(...)` — writes the accumulated content + token counts,
 *      marks READY, bumps conversation lastMessageAt.
 *   3. `fail(...)` — used when the upstream LLM errors mid-stream. Marks
 *      FAILED, preserves whatever partial content we got.
 */
export class AppendAssistantMessageUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async preparePlaceholder(input: {
    conversationId: string;
    modelId: string;
  }): Promise<MessageDto> {
    return this.messages.createAssistantPlaceholder({
      id: this.ids.next(),
      conversationId: input.conversationId,
      modelId: input.modelId,
      now: this.clock.now(),
    });
  }

  async finalize(input: {
    messageId: string;
    conversationId: string;
    content: string;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<MessageDto> {
    const finalized = await this.messages.finalizeAssistant({
      id: input.messageId,
      content: input.content,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
    });
    await this.conversations.touchLastMessage(
      input.conversationId,
      this.clock.now(),
    );
    return finalized;
  }

  async fail(input: {
    messageId: string;
    errorMessage: string;
    partialContent?: string;
  }): Promise<MessageDto> {
    return this.messages.failAssistant({
      id: input.messageId,
      errorMessage: input.errorMessage,
      partialContent: input.partialContent,
    });
  }
}
