import "server-only";
import OpenAI from "openai";
import type {
  EmbeddingLlm,
  EmbeddingLlmEmbedInput,
} from "@/shared/application/llm/embedding-llm";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";
import { env } from "@/config/env";

/**
 * OpenAI-compatible adapter for the `/v1/embeddings` endpoint. Same client
 * shape as {@link OpenRouterChatLlm} — but for embeddings.
 *
 * Provider selection is driven by `ResolvedModel.endpoint` on the
 * `EMBEDDING` `model_configs` row:
 *
 *   - `https://api.openai.com/v1`      → OpenAI direct (default)
 *   - `https://api.together.xyz/v1`    → Together (drop-in compatible)
 *   - `https://api.deepinfra.com/v1/openai` → DeepInfra
 *   - any OpenAI-compatible embedding endpoint works
 *
 * Authentication key: this adapter uses `OPENAI_API_KEY` regardless of
 * endpoint. If we later swap providers, we can either overload the key
 * env var (e.g. reuse for Together — many people do), add a per-provider
 * key resolution step keyed on `provider`, or move keys into a
 * `provider_credentials` table alongside `model_configs`. For v1, one key
 * is the simplest path.
 */
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export class OpenAIEmbeddingLlm implements EmbeddingLlm {
  async embed(input: EmbeddingLlmEmbedInput): Promise<number[][]> {
    if (input.texts.length === 0) return [];
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is required to compute embeddings. " +
          "Add it to .env or set MEMORY_ENABLED=false to skip the embedder path.",
      );
    }

    const client = this.clientFor(input.model);
    const dimensions = pickDimensions(input.model);

    const res = await client.embeddings.create(
      {
        model: input.model.modelId,
        input: input.texts as string[],
        ...(dimensions ? { dimensions } : {}),
      },
      { signal: input.signal },
    );

    // Result order matches input order per the OpenAI spec, but we sort
    // by `index` defensively in case a future provider reorders.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    return sorted.map((row) => row.embedding);
  }

  private clientFor(model: ResolvedModel): OpenAI {
    return new OpenAI({
      apiKey: env.OPENAI_API_KEY!,
      baseURL: model.endpoint ?? DEFAULT_OPENAI_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
        "X-Title": env.NEXT_PUBLIC_APP_NAME,
      },
    });
  }
}

function pickDimensions(model: ResolvedModel): number | null {
  const v = model.parameters["dimensions"];
  return typeof v === "number" && v > 0 ? v : null;
}
