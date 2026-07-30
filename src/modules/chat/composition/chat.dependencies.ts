import "server-only";
import type { ServerContext } from "@/composition/server-context";
import { env } from "@/config/env";
import { PrismaConversationRepository } from "../infrastructure/prisma-conversation.repository";
import { PrismaMessageRepository } from "../infrastructure/prisma-message.repository";
import { PrismaChatCharacterProvider } from "../infrastructure/prisma-chat-character.provider";
import { TemplatePromptComposer } from "../infrastructure/template-prompt-composer";
import { StartOrLoadConversationUseCase } from "../application/use-cases/start-or-load-conversation.use-case";
import { ListMessagesUseCase } from "../application/use-cases/list-messages.use-case";
import { AppendUserMessageUseCase } from "../application/use-cases/append-user-message.use-case";
import { AppendAssistantMessageUseCase } from "../application/use-cases/append-assistant-message.use-case";
import { BuildChatContextUseCase } from "../application/use-cases/build-chat-context.use-case";
import { BuildOpenerContextUseCase } from "../application/use-cases/build-opener-context.use-case";
import type { MemoryContextProvider } from "../application/ports/memory-context-provider";
import type { ConversationRepository } from "../application/ports/conversation-repository";
import type { MessageRepository } from "../application/ports/message-repository";
import type { ChatCharacterProvider } from "../application/ports/chat-character-provider";

/**
 * Composition factories for the chat module. The ONLY file allowed to see
 * both application ports and their concrete infrastructure adapters.
 *
 * Note: BuildChatContext depends on a `MemoryContextProvider` which the
 * memory module supplies. Callers pass it in explicitly so this file stays
 * free of memory-module imports (avoids an inter-module composition cycle
 * once the two are exercised in tests).
 */

export function createConversationRepository(
  ctx: ServerContext,
): ConversationRepository {
  return new PrismaConversationRepository(ctx.db);
}

export function createMessageRepository(
  ctx: ServerContext,
): MessageRepository {
  return new PrismaMessageRepository(ctx.db);
}

export function createChatCharacterProvider(
  ctx: ServerContext,
): ChatCharacterProvider {
  return new PrismaChatCharacterProvider(ctx.db);
}

export function createStartOrLoadConversationUseCase(
  ctx: ServerContext,
): StartOrLoadConversationUseCase {
  return new StartOrLoadConversationUseCase(
    createConversationRepository(ctx),
    createChatCharacterProvider(ctx),
    ctx.clock,
    ctx.ids,
  );
}

export function createListMessagesUseCase(
  ctx: ServerContext,
): ListMessagesUseCase {
  return new ListMessagesUseCase(
    createConversationRepository(ctx),
    createMessageRepository(ctx),
  );
}

export function createAppendUserMessageUseCase(
  ctx: ServerContext,
): AppendUserMessageUseCase {
  return new AppendUserMessageUseCase(
    createConversationRepository(ctx),
    createMessageRepository(ctx),
    ctx.clock,
    ctx.ids,
  );
}

export function createAppendAssistantMessageUseCase(
  ctx: ServerContext,
): AppendAssistantMessageUseCase {
  return new AppendAssistantMessageUseCase(
    createConversationRepository(ctx),
    createMessageRepository(ctx),
    ctx.clock,
    ctx.ids,
  );
}

export function createBuildChatContextUseCase(
  ctx: ServerContext,
  memory: MemoryContextProvider,
): BuildChatContextUseCase {
  return new BuildChatContextUseCase(
    createConversationRepository(ctx),
    createMessageRepository(ctx),
    createChatCharacterProvider(ctx),
    memory,
    new TemplatePromptComposer(),
    env.CHAT_MAX_HISTORY_TURNS,
  );
}

export function createBuildOpenerContextUseCase(
  ctx: ServerContext,
  memory: MemoryContextProvider,
): BuildOpenerContextUseCase {
  return new BuildOpenerContextUseCase(
    createConversationRepository(ctx),
    createMessageRepository(ctx),
    createChatCharacterProvider(ctx),
    memory,
    new TemplatePromptComposer(),
    env.CHAT_MAX_HISTORY_TURNS,
  );
}
