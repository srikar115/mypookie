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
  OpenerNotWarrantedError,
} from "../../domain/errors";
import { decideOpener } from "../../domain/opener-policy";
import type { Clock } from "@/shared/application/clock";

export interface BuiltOpenerContext {
  readonly character: ChatCharacterProfile;
  readonly messages: readonly LlmMessage[];
  readonly historyTurnCount: number;
}

/**
 * BuildOpenerContext — the "assemble everything the LLM needs when the
 * character is initiating the conversation" use case.
 *
 * Sibling of {@link BuildChatContextUseCase}, minus the `latestUserMessage`
 * turn: there is no latest user message when the character speaks first.
 *
 *   1. Loads the character (via ChatCharacterProvider port)
 *   2. Verifies conversation ownership
 *   3. Loads history messages
 *   4. Asks the memory port for the memory block (empty-query mode —
 *      falls back to relationship state + recent facts rather than a
 *      lexical-similarity retrieval, since there's no query text)
 *   5. Hands everything to `composer.composeOpener(...)`
 *
 * Read-only apart from RLS checks; does not persist anything. The
 * route persists the assistant reply after the LLM call returns.
 */
export class BuildOpenerContextUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly characters: ChatCharacterProvider,
    private readonly memory: MemoryContextProvider,
    private readonly composer: PromptComposer,
    private readonly historyLimit: number,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorUserId: string;
    conversationId: string;
    actorDisplayName?: string | null;
  }): Promise<BuiltOpenerContext> {
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

    // Gate on history before spending anything on memory retrieval or the
    // LLM. The client applies the same rule to avoid a pointless round
    // trip, but it can't be the only check: remounts, reloads, StrictMode,
    // and second tabs all slip past it, and every opener that gets through
    // is persisted into the thread permanently.
    const history = await this.messages.listRecent(conv.id, this.historyLimit);
    const decision = decideOpener(history, this.clock.now());
    if (!decision.warranted) {
      throw new OpenerNotWarrantedError(decision.reason);
    }

    const memoryBlock = await this.memory.getMemoryBlock({
      userId: input.actorUserId,
      characterId: conv.characterId,
      conversationId: conv.id,
      // No user message to key retrieval off — the memory provider
      // handles empty strings by falling back to relationship state
      // + top facts by recency instead of by similarity.
      userMessage: "",
      userDisplayName: input.actorDisplayName ?? null,
    });

    const messages = this.composer.composeOpener({
      character,
      memoryBlock,
      history,
    });

    return {
      character,
      messages,
      historyTurnCount: history.length,
    };
  }
}
