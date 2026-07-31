import "server-only";

/**
 * Compact projection of a Character sufficient to compose a chat prompt and
 * render UI-side conversation metadata. Kept small on purpose — the full
 * `CharacterDto` from the characters module lives elsewhere; chat only
 * needs the identity + prompt + one-liner.
 */
/**
 * Character biological/social gender for downstream consumers that need
 * to branch on it (voice-preset FALLBACK selection for TTS today when
 * a character has no real voice preset assigned yet; potentially
 * pronoun defaults or wardrobe cues later). Mirrors the DB enum
 * exactly so no translation is needed at the port boundary.
 */
export type ChatCharacterGender =
  | "FEMALE"
  | "MALE"
  | "NONBINARY"
  | "TRANS_WOMAN"
  | "TRANS_MAN";

/**
 * Providers we can route voice output to. Mirrors the DB
 * `VoiceProvider` enum. Runtime today only speaks CARTESIA; other
 * values are treated as fallback triggers by the voice pipeline.
 */
export type ChatCharacterVoiceProvider =
  | "MOCK_TTS"
  | "ELEVENLABS"
  | "OPENAI_REALTIME"
  | "CARTESIA"
  | "PLAYHT";

/**
 * Compact projection of the character's assigned voice preset. Each
 * character owns exactly one preset row in `voice_presets`; that row
 * carries the provider-specific voice identifier (e.g. Cartesia UUID)
 * that the LiveKit worker hands to the TTS plugin.
 *
 * `providerVoiceId` values prefixed with `mock-` mean the character
 * still has a placeholder assignment from the initial seed and is not
 * ready for real voice synthesis — consumers should fall back.
 */
export interface ChatCharacterVoicePreset {
  readonly provider: ChatCharacterVoiceProvider;
  readonly providerVoiceId: string;
  readonly language: string;
}

export interface ChatCharacterProfile {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly gender: ChatCharacterGender;
  readonly systemPrompt: string;
  readonly tagline: string | null;
  readonly relationshipLabel: string;
  readonly personalityLabel: string;
  readonly occupationLabel: string;
  readonly voicePreset: ChatCharacterVoicePreset | null;
}

/**
 * Port that lets chat load just-enough character data without depending on
 * the characters module's repository shape. The characters module (or a
 * chat-owned Prisma adapter) provides the implementation via composition.
 */
export interface ChatCharacterProvider {
  /**
   * Returns the character if it exists AND is owned by the caller. Returns
   * null for anything else — the use case throws {@link ChatCharacterUnavailableError}.
   */
  getForActor(
    characterId: string,
    actorUserId: string,
  ): Promise<ChatCharacterProfile | null>;
}
