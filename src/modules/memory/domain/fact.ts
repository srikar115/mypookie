/**
 * MemoryCategory mirrors the DB enum but is declared here so the domain
 * stays framework-free (rule 4). Values match the Prisma enum literals.
 */
export type MemoryCategory =
  | "IDENTITY"
  | "PREFERENCE"
  | "RELATIONSHIP"
  | "EVENT"
  | "PLAN"
  | "EMOTION"
  | "OPINION"
  | "COMMITMENT"
  | "OTHER";

/**
 * MemoryFactDraft — the shape the {@link FactExtractor} produces and the
 * {@link MemoryStore} consumes. Kept looser than the persisted row because
 * the LLM occasionally omits low-confidence fields.
 */
export interface MemoryFactDraft {
  readonly content: string;
  readonly category: MemoryCategory;
  readonly entities: readonly string[];
  readonly valence: number;
  readonly confidence: number;
  /**
   * Optional metadata bag — extractor can attach source hints (e.g.
   * `{ derivedFrom: "user"|"assistant"|"pair", timestamp: "..." }`).
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Optional expiry — TTL for time-bound facts (mood, plan for tonight). */
  readonly expiresAt?: Date;
}

/**
 * MemoryFact — the projection retrieval returns. Mirrors the row minus
 * embedding + expiry which the assemble step doesn't need.
 */
export interface MemoryFact {
  readonly id: string;
  readonly content: string;
  readonly category: MemoryCategory;
  readonly entities: readonly string[];
  readonly valence: number;
  readonly confidence: number;
  readonly extractedAt: Date;
  readonly score: number;
}
