/**
 * Server-side public API for the voice module. Server components, route
 * handlers, and server actions import from here; presentation components
 * import from `./client`.
 */

export type { CallSessionDto } from "./application/dto/call-session.dto";
export type { VoiceTurnDto } from "./application/dto/voice-turn.dto";
export type { VoiceTransportGrant } from "./application/ports/voice-transport-port";
export type { SpeechToTextConfig } from "./application/ports/speech-to-text-port";
export type { TextToSpeechConfig } from "./application/ports/text-to-speech-port";
export type { BuiltVoiceContext } from "./application/use-cases/build-voice-context.use-case";
export type {
  RecordedVoiceTurn,
} from "./application/use-cases/record-voice-turn.use-case";

export { ingestVoiceTurnInAfter } from "./application/use-cases/record-voice-turn.use-case";

export {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
  ConcurrentCallLimitError,
  DailyCallLimitExceededError,
  VoiceCallsDisabledError,
  VoiceTransportError,
} from "./domain/errors";

export {
  createCallSessionRepository,
  createVoiceTransport,
  createSpeechToText,
  createTextToSpeech,
  createStartCallUseCase,
  createEndCallUseCase,
  createBuildVoiceContextUseCase,
  createRecordVoiceTurnUseCase,
  createSummarizeCallUseCase,
  createTickCallCreditsUseCase,
} from "./composition/voice.dependencies";
