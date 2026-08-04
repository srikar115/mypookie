import "server-only";
import type { ServerContext } from "@/composition/server-context";
import { env } from "@/config/env";
import {
  createChatCharacterProvider,
  createConversationRepository,
  createMessageRepository,
  createPromptComposer,
} from "@/modules/chat";
import type { MemoryContextProvider } from "@/modules/chat";
import { PrismaCallSessionRepository } from "../infrastructure/prisma-call-session.repository";
import { LivekitTransportAdapter } from "../infrastructure/livekit-transport.adapter";
import { ModelConfigSttAdapter } from "../infrastructure/model-config-stt.adapter";
import { ModelConfigTtsAdapter } from "../infrastructure/model-config-tts.adapter";
import { StartCallUseCase } from "../application/use-cases/start-call.use-case";
import { EndCallUseCase } from "../application/use-cases/end-call.use-case";
import {
  BuildVoiceContextUseCase,
  type VoiceHistoryProvider,
} from "../application/use-cases/build-voice-context.use-case";
import { RecordVoiceTurnUseCase } from "../application/use-cases/record-voice-turn.use-case";
import { SummarizeCallUseCase } from "../application/use-cases/summarize-call.use-case";
import { TickCallCreditsUseCase } from "../application/use-cases/tick-call-credits.use-case";
import type { CallSessionRepository } from "../application/ports/call-session-repository";
import type { VoiceTransportPort } from "../application/ports/voice-transport-port";
import type { SpeechToTextPort } from "../application/ports/speech-to-text-port";
import type { TextToSpeechPort } from "../application/ports/text-to-speech-port";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";

/**
 * Composition factories for the voice module. Only file allowed to see both
 * application ports and their concrete infrastructure adapters. Follows the
 * chat module's factory pattern exactly.
 *
 * Note the "voice keys not configured" guard: each transport / STT / TTS
 * factory throws with a clear message if the corresponding env keys are
 * absent. `env.ts` already blocks boot when VOICE_CALLS_ENABLED=true and
 * keys are missing; these throws are a belt-and-braces backstop for callers
 * that forget to feature-flag their code path.
 */

function requireVoiceEnv(): {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  // Explicit-dispatch agent name (from LIVEKIT_AGENT_NAME env). When
  // undefined the adapter falls back to LiveKit's auto-dispatch — kept
  // as an escape hatch, not the intended production path.
  livekitAgentName: string | undefined;
  deepgramApiKey: string;
  cartesiaApiKey: string;
} {
  const {
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    DEEPGRAM_API_KEY,
    CARTESIA_API_KEY,
  } = env;
  if (
    !LIVEKIT_URL ||
    !LIVEKIT_API_KEY ||
    !LIVEKIT_API_SECRET ||
    !DEEPGRAM_API_KEY ||
    !CARTESIA_API_KEY
  ) {
    throw new Error(
      "[voice.composition] Voice keys not configured. Set VOICE_CALLS_ENABLED=true and provide LIVEKIT_*, DEEPGRAM_API_KEY, CARTESIA_API_KEY in .env.",
    );
  }
  return {
    livekitUrl: LIVEKIT_URL,
    livekitApiKey: LIVEKIT_API_KEY,
    livekitApiSecret: LIVEKIT_API_SECRET,
    // LIVEKIT_AGENT_NAME has a default in env.ts so this is always set
    // — but keep undefined as an escape hatch (empty string in .env).
    livekitAgentName: env.LIVEKIT_AGENT_NAME || undefined,
    deepgramApiKey: DEEPGRAM_API_KEY,
    cartesiaApiKey: CARTESIA_API_KEY,
  };
}

export function createCallSessionRepository(
  ctx: ServerContext,
): CallSessionRepository {
  return new PrismaCallSessionRepository(ctx.db);
}

export function createVoiceTransport(_ctx: ServerContext): VoiceTransportPort {
  const { livekitUrl, livekitApiKey, livekitApiSecret, livekitAgentName } =
    requireVoiceEnv();
  return new LivekitTransportAdapter(
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    livekitAgentName,
  );
}

export function createSpeechToText(ctx: ServerContext): SpeechToTextPort {
  const { deepgramApiKey } = requireVoiceEnv();
  return new ModelConfigSttAdapter(ctx.models, deepgramApiKey);
}

export function createTextToSpeech(ctx: ServerContext): TextToSpeechPort {
  const { cartesiaApiKey } = requireVoiceEnv();
  return new ModelConfigTtsAdapter(ctx.models, cartesiaApiKey);
}

export function createStartCallUseCase(ctx: ServerContext): StartCallUseCase {
  return new StartCallUseCase(
    createConversationRepository(ctx),
    createChatCharacterProvider(ctx),
    createCallSessionRepository(ctx),
    createVoiceTransport(ctx),
    ctx.clock,
    ctx.ids,
    env.VOICE_MAX_DAILY_MINUTES,
  );
}

export function createEndCallUseCase(ctx: ServerContext): EndCallUseCase {
  return new EndCallUseCase(
    createCallSessionRepository(ctx),
    createVoiceTransport(ctx),
    ctx.clock,
    ctx.db,
    ctx.ids,
  );
}

export function createBuildVoiceContextUseCase(
  ctx: ServerContext,
  memory: MemoryContextProvider,
): BuildVoiceContextUseCase {
  const historyProvider: VoiceHistoryProvider = {
    listRecent: (conversationId, limit) =>
      createMessageRepository(ctx).listRecent(conversationId, limit),
  };
  return new BuildVoiceContextUseCase(
    createConversationRepository(ctx),
    createChatCharacterProvider(ctx),
    createCallSessionRepository(ctx),
    historyProvider,
    memory,
    // Unified composer shared with text chat — voice mode is selected
    // internally by the use case via `mode: "voice"`. See §12.7 of
    // .agents/docs/voice-call-implementation.md.
    createPromptComposer(),
    env.CHAT_MAX_HISTORY_TURNS,
    {
      female: env.CARTESIA_VOICE_ID_FEMALE,
      male: env.CARTESIA_VOICE_ID_MALE,
      nonbinary: env.CARTESIA_VOICE_ID_NONBINARY,
    },
  );
}

export function createRecordVoiceTurnUseCase(
  ctx: ServerContext,
): RecordVoiceTurnUseCase {
  return new RecordVoiceTurnUseCase(
    ctx.db,
    createCallSessionRepository(ctx),
    ctx.clock,
    ctx.ids,
  );
}

export function createSummarizeCallUseCase(
  ctx: ServerContext,
): SummarizeCallUseCase {
  return new SummarizeCallUseCase(
    ctx.db,
    createCallSessionRepository(ctx),
    new OpenRouterChatLlm(),
    ctx.models,
  );
}

export function createTickCallCreditsUseCase(
  ctx: ServerContext,
): TickCallCreditsUseCase {
  return new TickCallCreditsUseCase(createCallSessionRepository(ctx));
}
