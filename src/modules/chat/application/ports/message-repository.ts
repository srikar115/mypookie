import "server-only";
import type { MessageDto, MessageRole } from "../dto/message.dto";

/**
 * MessageRepository — port for chat message persistence. Split from
 * ConversationRepository so mocking one side of the pair is cheap in tests.
 */
export interface MessageRepository {
  /**
   * Returns the last N messages of a conversation ordered oldest → newest,
   * ready to be fed to an LLM as history context.
   */
  listRecent(conversationId: string, limit: number): Promise<MessageDto[]>;

  /**
   * Returns the newest-first paginated view — used by the message list UI
   * when we later scroll back through history. Present for API symmetry
   * even though the initial UI slice only calls `listRecent`.
   */
  listByConversation(input: {
    conversationId: string;
    limit: number;
    beforeCreatedAt?: Date;
  }): Promise<MessageDto[]>;

  /**
   * Inserts a completed message in one shot (USER or SYSTEM messages).
   */
  append(input: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: string;
    now: Date;
  }): Promise<MessageDto>;

  /**
   * Inserts a placeholder assistant message that will be finalized after
   * the LLM stream closes. Kept separate from `append` so tokens/errors can
   * be recorded on the same row without a second INSERT.
   */
  createAssistantPlaceholder(input: {
    id: string;
    conversationId: string;
    modelId: string;
    now: Date;
  }): Promise<MessageDto>;

  /**
   * Finalizes an assistant placeholder with the accumulated content plus
   * optional token counts. Marks the row READY.
   */
  finalizeAssistant(input: {
    id: string;
    content: string;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<MessageDto>;

  /**
   * Marks an assistant placeholder FAILED after a streaming error. Content
   * is preserved (usually empty) and errorMessage is stored for debugging.
   */
  failAssistant(input: {
    id: string;
    errorMessage: string;
    partialContent?: string;
  }): Promise<MessageDto>;

  /** Counts messages in a conversation — used to trigger session summaries. */
  countByConversation(conversationId: string): Promise<number>;
}
