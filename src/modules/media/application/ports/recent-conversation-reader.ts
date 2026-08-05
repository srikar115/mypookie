import "server-only";

/**
 * One side of a spoken exchange, reduced to what a scene needs: who said it
 * and what they said.
 */
export interface ConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * Reads the tail of a conversation so a photo can be grounded in it.
 *
 * Media owns this port rather than reaching into the chat module because it
 * needs far less than chat's `MessageDto` carries — no ids, timestamps,
 * media joins, or status. Implementations are expected to drop empty
 * assistant placeholders (media bubbles and in-flight rows), which say
 * nothing about what the character is doing.
 */
export interface RecentConversationReader {
  listRecentTurns(
    conversationId: string,
    limit: number,
  ): Promise<ConversationTurn[]>;
}
