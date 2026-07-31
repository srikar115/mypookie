import "server-only";
import type { ChatMessage as LlmMessage } from "@/shared/application/llm/chat-llm";
import type {
  ChatCharacterGender,
  ChatCharacterProfile,
  ChatCharacterProvider,
  ConversationRepository,
  MemoryContextProvider,
  MessageDto,
  PromptComposer,
} from "@/modules/chat";
import type { CallSessionRepository } from "../ports/call-session-repository";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "@/modules/chat";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
} from "../../domain/errors";

/**
 * Config bag for the gender-based FALLBACK Cartesia voice picker.
 *
 * Two-tier resolution model:
 *   1. Preferred — `character.voicePreset.providerVoiceId` (from the
 *      `voice_presets` table via the `characters.voicePresetId` FK).
 *      This is what makes every character sound distinct.
 *   2. Fallback  — this env-configured gender map. Only used when
 *      the character was seeded before real presets existed
 *      (`providerVoiceId` starts with `mock-`), or when the assigned
 *      preset is on a non-Cartesia provider (`MOCK_TTS`, `ELEVENLABS`).
 *
 * See `env.ts` for the fallback default UUIDs (Tessa / Kyle).
 */
export interface VoicePresetConfig {
  readonly female: string;
  readonly male: string;
  readonly nonbinary?: string | null;
}

export interface BuiltVoiceContext {
  readonly character: ChatCharacterProfile;
  readonly messages: readonly LlmMessage[];
  readonly historyTurnCount: number;
  readonly callSessionId: string;
  /**
   * Cartesia voice UUID chosen for THIS character. Sourced from
   * `character.voicePreset.providerVoiceId` when it looks like a real
   * Cartesia UUID; otherwise falls back to a gender-based env default.
   * Also carries the resolution `source` so ops can see at a glance
   * whether the character has a real preset assigned or is still on
   * the fallback picker.
   */
  readonly voice: {
    readonly providerVoiceId: string;
    readonly source: "character_preset" | "gender_fallback";
  };
}

function looksLikeRealCartesiaVoiceId(providerVoiceId: string): boolean {
  // Cartesia UUIDs are canonical 36-char v4 UUIDs. The initial seed
  // wrote `mock-voice-01-confident` style placeholders which we should
  // NOT pass to Cartesia (it 404s), so gate strictly on UUID shape.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    providerVoiceId,
  );
}

function pickVoiceIdByGender(
  gender: ChatCharacterGender,
  presets: VoicePresetConfig,
): string {
  switch (gender) {
    case "FEMALE":
    case "TRANS_WOMAN":
      return presets.female;
    case "MALE":
    case "TRANS_MAN":
      return presets.male;
    case "NONBINARY":
      return presets.nonbinary ?? presets.female;
  }
}

function resolveVoiceId(
  character: ChatCharacterProfile,
  fallback: VoicePresetConfig,
): { providerVoiceId: string; source: "character_preset" | "gender_fallback" } {
  const preset = character.voicePreset;
  if (
    preset &&
    preset.provider === "CARTESIA" &&
    looksLikeRealCartesiaVoiceId(preset.providerVoiceId)
  ) {
    return {
      providerVoiceId: preset.providerVoiceId,
      source: "character_preset",
    };
  }
  return {
    providerVoiceId: pickVoiceIdByGender(character.gender, fallback),
    source: "gender_fallback",
  };
}

/**
 * BuildVoiceContext — the voice equivalent of {@link BuildChatContextUseCase}.
 *
 * Runs on every user utterance the agent worker forwards. The agent hits a
 * server-to-server endpoint that resolves the call session, checks ownership,
 * reuses chat's memory + history loaders, and hands everything to the
 * unified prompt composer with `mode: "voice"`.
 *
 * The `latestUserMessage` here is the STT transcript of what the user just
 * said. Empty string is legal when the agent is warming up the opener — the
 * composer then routes through `composeOpener`.
 *
 * We pass a `MessageRepository`-agnostic history loader in through the
 * `historyProvider` port so the voice use case can rely on chat's `listRecent`
 * without importing infra directly.
 *
 * NOTE: since 2026-07-31 this use case depends on the shared
 * `PromptComposer` port (not a voice-specific one). The mode flag on
 * the composer methods is what selects the voice output style. This
 * is deliberate — text and voice must never drift, so they share the
 * same composer implementation.
 */
export interface VoiceHistoryProvider {
  listRecent(conversationId: string, limit: number): Promise<MessageDto[]>;
}

export class BuildVoiceContextUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly characters: ChatCharacterProvider,
    private readonly callSessions: CallSessionRepository,
    private readonly history: VoiceHistoryProvider,
    private readonly memory: MemoryContextProvider,
    private readonly composer: PromptComposer,
    private readonly historyLimit: number,
    private readonly voicePresets: VoicePresetConfig,
  ) {}

  async execute(input: {
    callSessionId: string;
    actorUserId: string;
    actorDisplayName?: string | null;
    latestUserMessage: string;
  }): Promise<BuiltVoiceContext> {
    const session = await this.callSessions.findById(input.callSessionId);
    if (!session) throw new CallSessionNotFoundError(input.callSessionId);
    if (session.userId !== input.actorUserId) {
      throw new CallSessionAccessDeniedError(input.callSessionId);
    }

    const conv = await this.conversations.findById(session.conversationId);
    if (!conv) throw new ConversationNotFoundError(session.conversationId);
    if (conv.userId !== input.actorUserId) {
      throw new ConversationAccessDeniedError(session.conversationId);
    }

    const character = await this.characters.getForActor(
      conv.characterId,
      input.actorUserId,
    );
    if (!character) {
      throw new ChatCharacterUnavailableError(conv.characterId);
    }

    const [history, memoryBlock] = await Promise.all([
      this.history.listRecent(conv.id, this.historyLimit),
      this.memory.getMemoryBlock({
        userId: input.actorUserId,
        characterId: conv.characterId,
        conversationId: conv.id,
        userMessage: input.latestUserMessage,
        userDisplayName: input.actorDisplayName ?? null,
      }),
    ]);

    const messages =
      input.latestUserMessage.trim().length === 0
        ? this.composer.composeOpener({
            character,
            memoryBlock,
            history,
            mode: "voice",
          })
        : this.composer.compose({
            character,
            memoryBlock,
            history,
            latestUserMessage: input.latestUserMessage,
            mode: "voice",
          });

    return {
      character,
      messages,
      historyTurnCount: history.length,
      callSessionId: session.id,
      voice: resolveVoiceId(character, this.voicePresets),
    };
  }
}
