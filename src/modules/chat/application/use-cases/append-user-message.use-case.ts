import "server-only";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type { ConversationRepository } from "../ports/conversation-repository";
import type { MessageRepository } from "../ports/message-repository";
import type { MessageDto } from "../dto/message.dto";
import {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "../../domain/errors";

/**
 * AppendUserMessage — validates access, persists the user turn, and bumps
 * `lastMessageAt` so the sidebar order stays fresh. Called first in the
 * streaming route so failures short-circuit before any LLM cost accrues.
 */
export class AppendUserMessageUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    actorUserId: string;
    conversationId: string;
    content: string;
  }): Promise<MessageDto> {
    const conv = await this.conversations.findById(input.conversationId);
    if (!conv) throw new ConversationNotFoundError(input.conversationId);
    if (conv.userId !== input.actorUserId) {
      throw new ConversationAccessDeniedError(input.conversationId);
    }

    const now = this.clock.now();
    const msg = await this.messages.append({
      id: this.ids.next(),
      conversationId: conv.id,
      role: "USER",
      content: input.content,
      now,
    });
    await this.conversations.touchLastMessage(conv.id, now);
    return msg;
  }
}
