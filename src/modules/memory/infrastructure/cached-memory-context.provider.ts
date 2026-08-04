import "server-only";
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import type { MemoryContextProvider } from "@/modules/chat";

/**
 * CachedMemoryContextProvider — Redis-backed decorator around any
 * concrete {@link MemoryContextProvider} (in practice `AssembleContext-
 * UseCase`).
 *
 * ## Why this exists
 *
 * The 2026-08-04 voice audit showed `/context` fetches taking 200–600ms
 * per user turn, dominated by hybrid memory search: query embedding +
 * pgvector ANN + four parallel Postgres reads + block composition. That
 * cost is baked into the "user thinks nothing is happening" gap that
 * agent.ts's 350ms budget can only paper over.
 *
 * Since the memory block is deterministic given
 * `(userId, characterId, conversationId, userMessage, displayName)`, we
 * can memoize the whole assembled string in Redis. When the same tuple
 * recurs — user says "hi" a second time, opener refetch during a race,
 * multi-tab chat load — we skip the entire assembly path.
 *
 * ## Cache key
 *
 *   mem:v1:<sha256(userId | characterId | conversationId | userMessage | displayName)>
 *
 * Content-addressed. Includes `userMessage` because the top-K memory hits
 * are scored against it — two calls with the same message get the same
 * block; two calls with different messages don't collide.
 *
 * ## TTL and invalidation
 *
 * TTL is short (60s by default) because the memory pipeline runs an
 * async `IngestTurnUseCase` after every turn that can add facts or
 * update relationship state. Rather than plumb an invalidation signal
 * through the ingest path, we lean on TTL: within a call the same
 * utterance is unlikely to recur within 60s, and between turns any
 * change from ingest will be seen on the next cache miss.
 *
 * If we later want to eliminate the staleness window, the ingest use
 * case can `SCAN mem:v1:<partial>*` and `DEL` matching keys on flush.
 * Not worth the code complexity today.
 *
 * ## Failure policy
 *
 * Fail-OPEN. If Redis is unreachable we log once per call and delegate
 * to the underlying provider. A cache outage must never break memory
 * assembly (already tolerant of provider failures too).
 *
 * ## Telemetry
 *
 * Every call logs one line to stdout:
 *
 *     [mem-cache] hit=true ms=3 conv=<id> chars=1834
 *     [mem-cache] hit=false ms=284 conv=<id> chars=1834
 *
 * `ms` on a hit is the Redis GET round-trip; on a miss it's the total
 * assembly time (inner + cache write). Operators can grep for hit=false
 * to see the true worst-case latency.
 */

const CACHE_KEY_PREFIX = "mem:v1";
const DEFAULT_TTL_SEC = 60;

export class CachedMemoryContextProvider implements MemoryContextProvider {
  constructor(
    private readonly inner: MemoryContextProvider,
    private readonly redis: Redis,
    private readonly ttlSec: number = DEFAULT_TTL_SEC,
  ) {}

  async getMemoryBlock(input: {
    userId: string;
    characterId: string;
    conversationId: string;
    userMessage: string;
    userDisplayName?: string | null;
  }): Promise<string> {
    const key = keyFor(input);
    const started = Date.now();

    // 1) Cache lookup — fail-open on Redis errors.
    let cached: string | null;
    try {
      cached = await this.redis.get(key);
    } catch (err) {
      console.warn(
        `[mem-cache] redis get failed, bypassing cache:`,
        (err as Error).message,
      );
      return this.inner.getMemoryBlock(input);
    }

    if (cached !== null) {
      console.log(
        `[mem-cache] hit=true ms=${Date.now() - started} conv=${input.conversationId} chars=${cached.length}`,
      );
      return cached;
    }

    // 2) Miss — assemble fresh, then write-through.
    const block = await this.inner.getMemoryBlock(input);

    // Empty blocks (MEMORY_ENABLED=false or nothing to inject) are still
    // cached — they're deterministic given the inputs, and skipping the
    // write would mean re-running assembly repeatedly for no reason.
    this.redis
      .set(key, block, "EX", this.ttlSec)
      .catch((err) =>
        console.warn(
          `[mem-cache] redis set failed:`,
          (err as Error).message,
        ),
      );

    console.log(
      `[mem-cache] hit=false ms=${Date.now() - started} conv=${input.conversationId} chars=${block.length}`,
    );
    return block;
  }
}

function keyFor(input: {
  userId: string;
  characterId: string;
  conversationId: string;
  userMessage: string;
  userDisplayName?: string | null;
}): string {
  // Normalize the user message so trivial whitespace variations
  // ("hi ", "hi") collapse to the same key. Don't case-fold — the
  // memory scorer is case/punctuation-sensitive downstream.
  const normalizedMsg = input.userMessage.trim().replace(/\s+/g, " ");
  const parts = [
    input.userId,
    input.characterId,
    input.conversationId,
    normalizedMsg,
    input.userDisplayName ?? "",
  ].join("\x00");
  const h = createHash("sha256").update(parts).digest("hex").slice(0, 32);
  return `${CACHE_KEY_PREFIX}:${h}`;
}
