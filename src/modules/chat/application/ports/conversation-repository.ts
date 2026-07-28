import "server-only";
import type { ConversationDto } from "../dto/conversation.dto";

/**
 * ConversationRepository — port for conversation persistence.
 *
 * There is exactly one conversation per (userId, characterId): the
 * `conversations_userId_characterId_key` unique index enforces that at the
 * DB level, so `startOrLoad` is idempotent on retry.
 */
export interface ConversationRepository {
  findByUserAndCharacter(
    userId: string,
    characterId: string,
  ): Promise<ConversationDto | null>;

  findById(id: string): Promise<ConversationDto | null>;

  /**
   * Atomically upserts the (userId, characterId) row. Returns the resolved
   * conversation. Used by StartOrLoadConversationUseCase.
   */
  startOrLoad(input: {
    id: string;
    userId: string;
    characterId: string;
    now: Date;
  }): Promise<ConversationDto>;

  /** Bumps `lastMessageAt` so sidebar ordering stays fresh. */
  touchLastMessage(conversationId: string, at: Date): Promise<void>;
}
