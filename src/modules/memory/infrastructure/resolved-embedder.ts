import "server-only";
import type { EmbeddingLlm } from "@/shared/application/llm/embedding-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type { Embedder } from "../application/ports/embedder";

/**
 * ResolvedEmbedder — adapter that hides the model-config lookup from the
 * memory use cases. On every call it resolves the EMBEDDING row (cached
 * ~60s by the repository) and delegates to the provider-agnostic
 * {@link EmbeddingLlm}. This is exactly the same pattern the fact
 * extractor and summarizer use for chat models, so admin edits to
 * `model_configs.EMBEDDING` (say, swapping to a Together-hosted model
 * with a different endpoint) propagate without a redeploy.
 */
export class ResolvedEmbedder implements Embedder {
  constructor(
    private readonly llm: EmbeddingLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = await this.models.resolve("EMBEDDING");
    return this.llm.embed({ model, texts, signal });
  }
}
