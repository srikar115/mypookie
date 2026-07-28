import "server-only";
import type { MemoryFact } from "../../domain/fact";

/**
 * HybridSearcher — read-side port for Layer 2 retrieval. v1 uses
 * BM25 + entity match + recency; the {@link PgHybridSearcher} adapter
 * performs it in one SQL query. When embeddings ship, a new adapter (or a
 * decorator) folds cosine similarity into the same score.
 */
export interface HybridSearcher {
  search(input: {
    userId: string;
    characterId: string | null;
    query: string;
    entities: readonly string[];
    limit: number;
  }): Promise<MemoryFact[]>;
}
