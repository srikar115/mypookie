import "server-only";

export interface ReferenceImageResolver {
  /**
   * Resolves a reference image URL for consistency in edit-mode generations.
   *
   * Resolution order:
   *   1. Explicit `referenceMediaId` from the composer (user picked a previous image)
   *   2. Latest completed image for this user+companion conversation
   *   3. Companion avatar / appearance profile reference image
   *
   * Returns null if no reference is available (sibling swap to T2I applies).
   */
  resolve(input: {
    referenceMediaId: string | null;
    userId: string;
    characterId: string;
    conversationId: string;
  }): Promise<string | null>;
}
