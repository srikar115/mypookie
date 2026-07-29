import "server-only";
import type { MemoryFactDraft } from "../../domain/fact";

/**
 * MemoryStore — write-side port for Layer 2 (extracted facts) and Layer 3b
 * (structured facts on the user profile).
 */
export interface MemoryStore {
  /**
   * Bulk inserts new fact rows. No dedupe here — the extractor is expected
   * to gate obvious repeats before it hands off. Insertions must be
   * idempotent-friendly (unique constraint TBD; for v1 we accept duplicates
   * and let retrieval score them together).
   *
   * `embeddings` is index-aligned with `drafts`. A `null` entry (or the
   * whole array being omitted) writes NULL into `memory_facts.embedding`
   * for that row — semantic retrieval then falls back to lexical + entity
   * + recency for that fact.
   */
  insertFacts(input: {
    userId: string;
    characterId: string;
    sourceMessageId: string | null;
    drafts: readonly MemoryFactDraft[];
    embeddings?: readonly (readonly number[] | null)[];
    now: Date;
  }): Promise<number>;

  /**
   * Merges a partial patch into `user_profiles.structuredFacts`. Only
   * IDENTITY-category facts from the extractor promote here.
   */
  upsertStructuredFacts(input: {
    userId: string;
    patch: Readonly<Record<string, unknown>>;
  }): Promise<void>;

  /**
   * Reads the current structuredFacts blob for the given user. Returns an
   * empty object if the profile row is missing or has never been populated.
   */
  readStructuredFacts(userId: string): Promise<Record<string, unknown>>;

  /** Read the persisted session summary (or null if never summarized). */
  readSessionSummary(
    conversationId: string,
  ): Promise<{ summary: string; turnsCovered: number } | null>;

  /** Overwrite the session summary for a conversation. */
  upsertSessionSummary(input: {
    conversationId: string;
    summary: string;
    turnsCovered: number;
  }): Promise<void>;
}
