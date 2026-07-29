import "server-only";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";

/**
 * EmbeddingLlm — provider-agnostic port for text embedding models.
 *
 * Batching is first-class: `embed()` takes an array of texts and returns a
 * parallel array of vectors. Callers wanting a single embedding pass a
 * one-element array and take `result[0]`. OpenAI-compatible providers
 * accept up to 2048 inputs per call, so this design lets us collapse a
 * turn's ~4 extracted facts into a single provider round-trip.
 *
 * `dimensions` is read from `ResolvedModel.parameters.dimensions` (if
 * present) so the DB row is authoritative for embedding length. Our
 * `memory_facts.embedding` column is `vector(1024)`, so the seed row sets
 * dimensions=1024 and adapters MUST pass it through to enable Matryoshka
 * truncation on models that support it (text-embedding-3-small does).
 */
export interface EmbeddingLlmEmbedInput {
  readonly model: ResolvedModel;
  readonly texts: readonly string[];
  readonly signal?: AbortSignal;
}

export interface EmbeddingLlm {
  embed(input: EmbeddingLlmEmbedInput): Promise<number[][]>;
}
