/**
 * Domain errors for the chat module. Every error is a plain class so
 * presentation-layer callers can `instanceof` check without importing infra.
 */

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation ${id} not found.`);
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationAccessDeniedError extends Error {
  constructor(conversationId: string) {
    super(
      `Actor is not permitted to access conversation ${conversationId}.`,
    );
    this.name = "ConversationAccessDeniedError";
  }
}

export class ChatCharacterUnavailableError extends Error {
  constructor(characterId: string) {
    super(
      `Character ${characterId} is not available for chat (missing, archived, or not owned by actor).`,
    );
    this.name = "ChatCharacterUnavailableError";
  }
}
