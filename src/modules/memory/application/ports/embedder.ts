import "server-only";

/**
 * Embedder — memory-facing port for vectorizing text. Wraps the shared
 * {@link EmbeddingLlm} + the EMBEDDING `ResolvedModel` lookup so the use
 * cases don't need to know about model configuration.
 *
 * Callers pass an array (facts to embed on the write path, or `[query]`
 * on the read path) and receive an index-aligned array of vectors. Length
 * is fixed by the resolved model (currently 1024 via Matryoshka
 * truncation on text-embedding-3-small) and is validated against the DB
 * column width at write time by pgvector itself.
 *
 * Implementations MUST be tolerant of empty inputs (return `[]`) and MUST
 * be safe to call in parallel with unrelated LLM traffic.
 */
export interface Embedder {
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}
