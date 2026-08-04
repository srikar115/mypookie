import "server-only";
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import type {
  EmbeddingLlm,
  EmbeddingLlmEmbedInput,
} from "@/shared/application/llm/embedding-llm";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";

/**
 * CachedEmbeddingLlm — Redis-backed decorator around any `EmbeddingLlm`.
 *
 * Embedding calls are the single biggest network cost on the memory hot
 * path: every voice-agent turn, every chat message, every opener re-fires
 * an OpenAI `/v1/embeddings` request just to score the user's utterance
 * against stored memory facts. That's a 100–200ms round-trip PLUS a
 * fraction-of-a-cent charge, per turn, per user.
 *
 * Casual RP chat is extremely repetitive — "hey", "you there?", "what's
 * up" recur constantly, and the fact-ingest path re-embeds the same
 * "user's name is X" fact every time it's re-extracted. Realistic hit
 * rates in similar apps land in the 30–50% range, which directly deletes
 * that many 100–200ms network calls from every request.
 *
 * ## Design
 *
 * - **Layer**: sits at the {@link EmbeddingLlm} boundary (below
 *   {@link ResolvedEmbedder}, above the provider). Model+dimensions are
 *   available in the input, so the cache key naturally distinguishes
 *   text-embedding-3-small@1024 from a future Together-hosted model.
 * - **Cache key**: `embed:v1:<modelId>:<dims>:<sha256(text)>`. Content-
 *   addressed; two identical strings share a cache slot regardless of
 *   which route embedded them first.
 * - **Batch-aware**: on a mixed batch (some hits, some misses) we call
 *   the underlying LLM ONCE with just the miss subset, then splice
 *   results back into the original index order. Zero wasted provider
 *   traffic.
 * - **Storage**: JSON-encoded float arrays. At 1024 dims that's ~10 KB
 *   per vector — fine for Redis memory (~10k unique queries = ~100 MB).
 *   Binary packing is a later optimization if we ever want it.
 * - **Failure policy**: fail-OPEN. If Redis is unreachable, we log once
 *   per call and delegate everything to the underlying LLM. A cache
 *   outage must never break embeddings.
 *
 * ## Telemetry
 *
 * Every call logs one line to stdout:
 *
 *     [embed-cache] hit=8 miss=2 batch=10 model=text-embedding-3-small ms=143 saved_ms=~800
 *
 * `saved_ms` is a rough estimate (150ms × hits) so operators can see the
 * cache paying for itself in production logs without a metrics pipeline.
 */

const CACHE_KEY_PREFIX = "embed:v1";
const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7; // 7 days — embeddings are stable
const APPROX_EMBED_MS = 150; // used for saved_ms telemetry only

export class CachedEmbeddingLlm implements EmbeddingLlm {
  constructor(
    private readonly inner: EmbeddingLlm,
    private readonly redis: Redis,
    private readonly ttlSec: number = DEFAULT_TTL_SEC,
  ) {}

  async embed(input: EmbeddingLlmEmbedInput): Promise<number[][]> {
    if (input.texts.length === 0) return [];

    const started = Date.now();
    const keys = input.texts.map((t) => keyFor(input.model, t));

    // 1) Batch GET all cache slots in one round-trip.
    let cached: (string | null)[];
    try {
      cached = await this.redis.mget(...keys);
    } catch (err) {
      // Redis unreachable — bypass cache entirely, delegate to the LLM.
      console.warn(
        `[embed-cache] redis mget failed, bypassing cache:`,
        (err as Error).message,
      );
      return this.inner.embed(input);
    }

    // 2) Partition inputs into (hits with parsed vec) and (misses to
    // fetch). Preserve original index order so callers can zip results
    // with their input text array.
    const out: number[][] = new Array(input.texts.length);
    const missIdx: number[] = [];
    const missTexts: string[] = [];
    for (let i = 0; i < input.texts.length; i++) {
      const raw = cached[i];
      if (raw !== null) {
        try {
          out[i] = JSON.parse(raw) as number[];
          continue;
        } catch {
          // Corrupted value in Redis — treat as miss.
        }
      }
      missIdx.push(i);
      missTexts.push(input.texts[i]);
    }

    // 3) One provider call for all misses. Splice results back by index.
    if (missTexts.length > 0) {
      const fresh = await this.inner.embed({ ...input, texts: missTexts });
      const pipeline = this.redis.pipeline();
      for (let i = 0; i < missTexts.length; i++) {
        const idx = missIdx[i];
        out[idx] = fresh[i];
        pipeline.set(
          keys[idx],
          JSON.stringify(fresh[i]),
          "EX",
          this.ttlSec,
        );
      }
      // Fire-and-forget the write pipeline — successful embedding must
      // not be gated on cache write success. Log on failure.
      pipeline.exec().catch((err) => {
        console.warn(
          `[embed-cache] redis pipeline write failed:`,
          (err as Error).message,
        );
      });
    }

    const hits = input.texts.length - missTexts.length;
    const savedMs = hits * APPROX_EMBED_MS;
    console.log(
      `[embed-cache] hit=${hits} miss=${missTexts.length} batch=${input.texts.length} model=${input.model.modelId} ms=${Date.now() - started} saved_ms=~${savedMs}`,
    );

    return out;
  }
}

function keyFor(model: ResolvedModel, text: string): string {
  const dims = pickDimensions(model);
  // Normalize whitespace so "hi " and "hi" share a slot. Aggressive
  // normalization (case folding, punctuation stripping) would produce
  // wrong embeddings for real text — the model is case-sensitive.
  const normalized = text.trim().replace(/\s+/g, " ");
  const h = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `${CACHE_KEY_PREFIX}:${model.modelId}:${dims ?? "d"}:${h}`;
}

function pickDimensions(model: ResolvedModel): number | null {
  const v = model.parameters["dimensions"];
  return typeof v === "number" && v > 0 ? v : null;
}
