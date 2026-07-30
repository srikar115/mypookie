/**
 * Server-side public API for the chat module. Server components, route
 * handlers, and server actions import from here; presentation components
 * import from `./client`.
 */

export type { ConversationDto } from "./application/dto/conversation.dto";
export type { MessageDto, MessageRole, MessageStatus } from "./application/dto/message.dto";
export type { MemoryContextProvider } from "./application/ports/memory-context-provider";
export type { BuiltChatContext } from "./application/use-cases/build-chat-context.use-case";
export type { BuiltOpenerContext } from "./application/use-cases/build-opener-context.use-case";

export {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  ChatCharacterUnavailableError,
} from "./domain/errors";

export {
  createConversationRepository,
  createMessageRepository,
  createChatCharacterProvider,
  createStartOrLoadConversationUseCase,
  createListMessagesUseCase,
  createAppendUserMessageUseCase,
  createAppendAssistantMessageUseCase,
  createBuildChatContextUseCase,
  createBuildOpenerContextUseCase,
} from "./composition/chat.dependencies";
