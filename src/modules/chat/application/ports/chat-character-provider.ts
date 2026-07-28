import "server-only";

/**
 * Compact projection of a Character sufficient to compose a chat prompt and
 * render UI-side conversation metadata. Kept small on purpose — the full
 * `CharacterDto` from the characters module lives elsewhere; chat only
 * needs the identity + prompt + one-liner.
 */
export interface ChatCharacterProfile {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly systemPrompt: string;
  readonly tagline: string | null;
  readonly relationshipLabel: string;
  readonly personalityLabel: string;
  readonly occupationLabel: string;
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
