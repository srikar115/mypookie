import "server-only";
import type { MemoryFactDraft } from "../../domain/fact";

/**
 * MemoryStore — write-side port for Layer 2 (extracted facts) and Layer 3b
 * (structured facts on the user profile).
 */
export interface MemoryStore {
  /**
   * Bulk inserts new fact rows, skipping any the store already holds for
   * this user + character. The extractor sees one turn at a time and cannot
   * know what has been said before, so restating something durable is
   * normal and must not accumulate: retrieval reads only the top
   * MEMORY_TOP_K facts, and a handful of copies of one fact is enough to
   * push every other memory out of the prompt.
   *
   * A fact is "already held" if its normalized content matches, or — for
   * IDENTITY facts — if it describes the same `metadata.key` attribute.
   * Returns the number of rows actually written, which may be fewer than
   * `drafts.length`.
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
