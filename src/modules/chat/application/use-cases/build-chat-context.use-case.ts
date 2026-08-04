import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type {
  ChatCharacterProfile,
  ChatCharacterProvider,
} from "../ports/chat-character-provider";
import type { ConversationRepository } from "../ports/conversation-repository";
import type { MemoryContextProvider } from "../ports/memory-context-provider";
import type { MessageRepository } from "../ports/message-repository";
import type { PromptComposer } from "../ports/prompt-composer";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "../../domain/errors";

export interface BuiltChatContext {
  readonly character: ChatCharacterProfile;
  readonly messages: readonly LlmMessage[];
  readonly historyTurnCount: number;
}

/**
 * BuildChatContext — the "assemble everything the LLM needs" use case.
 *
 *   1. Loads the character (via ChatCharacterProvider port)
 *   2. Verifies conversation ownership
 *   3. Loads history messages
 *   4. Asks the memory port for the memory block
 *   5. Hands everything to the PromptComposer
 *
 * Called by the streaming route once per turn. Read-only apart from RLS
 * checks; does not persist anything.
 */
export class BuildChatContextUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly characters: ChatCharacterProvider,
    private readonly memory: MemoryContextProvider,
    private readonly composer: PromptComposer,
    private readonly historyLimit: number,
  ) {}

  async execute(input: {
    actorUserId: string;
    conversationId: string;
    latestUserMessage: string;
    /**
     * Optional — passed through to the memory module as a fallback name
     * so the model can greet the user by name from turn one, even before
     * fact extraction has captured it.
     */
    actorDisplayName?: string | null;
    /**
     * Set by the delivery layer when a generation is already firing for this
     * turn, so the reply reads as the caption on the incoming photo.
     */
    pendingMedia?: "image" | "video" | null;
  }): Promise<BuiltChatContext> {
    const conv = await this.conversations.findById(input.conversationId);
    if (!conv) throw new ConversationNotFoundError(input.conversationId);
    if (conv.userId !== input.actorUserId) {
      throw new ConversationAccessDeniedError(input.conversationId);
    }

    const character = await this.characters.getForActor(
      conv.characterId,
      input.actorUserId,
    );
    if (!character) {
      throw new ChatCharacterUnavailableError(conv.characterId);
    }

    // Fire history + memory in parallel — one is Postgres, the other is
    // Postgres + optional LLM (extractor/summarizer path). Independent.
    const [history, memoryBlock] = await Promise.all([
      this.messages.listRecent(conv.id, this.historyLimit),
      this.memory.getMemoryBlock({
        userId: input.actorUserId,
        characterId: conv.characterId,
        conversationId: conv.id,
        userMessage: input.latestUserMessage,
        userDisplayName: input.actorDisplayName ?? null,
      }),
    ]);

    const messages = this.composer.compose({
      character,
      memoryBlock,
      history,
      latestUserMessage: input.latestUserMessage,
      pendingMedia: input.pendingMedia ?? null,
    });

    return { character, messages, historyTurnCount: history.length };
  }
}
