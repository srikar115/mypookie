import "server-only";
import type { ConversationRepository } from "../ports/conversation-repository";
import type { MessageRepository } from "../ports/message-repository";
import type { MessageDto } from "../dto/message.dto";
import {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "../../domain/errors";

/**
 * ListMessages — returns the recent N messages of a conversation the caller
 * owns. Access is verified against the conversation's `userId` — a defense
 * layer in addition to the RLS setting on the table.
 */
export class ListMessagesUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  async execute(input: {
    actorUserId: string;
    conversationId: string;
    limit: number;
  }): Promise<MessageDto[]> {
    const conv = await this.conversations.findById(input.conversationId);
    if (!conv) throw new ConversationNotFoundError(input.conversationId);
    if (conv.userId !== input.actorUserId) {
      throw new ConversationAccessDeniedError(input.conversationId);
    }
    return this.messages.listRecent(conv.id, input.limit);
  }
}
