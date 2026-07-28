import "server-only";

/**
 * Slot the memory module fills. Kept in the chat module's application layer
 * so the chat use cases depend only on this narrow port (DIP) — the memory
 * module is the concrete implementation, injected via composition.
 *
 * The returned block is a preformatted string that goes into the system
 * prompt. Chat does not care what's inside: session summary, top-K facts,
 * relationship state, structured facts — memory decides.
 */
export interface MemoryContextProvider {
  /**
   * Returns the memory block for a given (user, character, conversation)
   * triple. Returns an empty string if MEMORY_ENABLED is false or the
   * memory module has nothing to inject.
   */
  getMemoryBlock(input: {
    userId: string;
    characterId: string;
    conversationId: string;
    userMessage: string;
  }): Promise<string>;
}
