/**
 * Server-side public API for the chat module. Server components, route
 * handlers, and server actions import from here; presentation components
 * import from `./client`.
 */

export type { ConversationDto } from "./application/dto/conversation.dto";
export type { MessageDto, MessageRole, MessageStatus } from "./application/dto/message.dto";
export type { MemoryContextProvider } from "./application/ports/memory-context-provider";
export type {
  ChatCharacterGender,
  ChatCharacterProfile,
  ChatCharacterProvider,
  ChatCharacterVoicePreset,
  ChatCharacterVoiceProvider,
} from "./application/ports/chat-character-provider";
export type { ConversationRepository } from "./application/ports/conversation-repository";
export type { MessageRepository } from "./application/ports/message-repository";
export type { PromptComposer, PromptMode } from "./application/ports/prompt-composer";
export type { BuiltChatContext } from "./application/use-cases/build-chat-context.use-case";
export type { BuiltOpenerContext } from "./application/use-cases/build-opener-context.use-case";

export {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  ChatCharacterUnavailableError,
  OpenerNotWarrantedError,
} from "./domain/errors";

export {
  stripModalityTags,
  humanizeTtsMarkers,
  sanitizeAssistantReply,
} from "./domain/sanitize-reply";

export {
  stripVisualActionSentinel,
  parseVisualAction,
} from "./domain/visual-action";
export type { VisualActionPayload } from "./domain/visual-action";

export {
  createConversationRepository,
  createMessageRepository,
  createChatCharacterProvider,
  createPromptComposer,
  createStartOrLoadConversationUseCase,
  createListMessagesUseCase,
  createAppendUserMessageUseCase,
  createAppendAssistantMessageUseCase,
  createBuildChatContextUseCase,
  createBuildOpenerContextUseCase,
} from "./composition/chat.dependencies";
