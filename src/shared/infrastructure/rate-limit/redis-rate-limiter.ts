import "server-only";
import type Redis from "ioredis";

/**
 * Fixed-window rate limiter backed by Redis `INCR` + `EXPIRE`.
 *
 * ## Why not sliding window
 *
 * True sliding-window rate limiting needs a Redis sorted set of
 * timestamps per subject (a couple of ZADD + ZREMRANGEBYSCORE + ZCARD
 * per check). Fixed-window is 2 ops (INCR + conditional EXPIRE), atomic
 * without a Lua script, and off by at most one window's boundary — which
 * is fine for abuse prevention where the goal is capping cost, not
 * enforcing a millisecond-precise SLA.
 *
 * If we later need precision (e.g. paid-tier SLA), swap in a sliding-
 * window impl behind the same {@link checkRateLimit} interface — the
 * call sites don't care.
 *
 * ## Failure policy
 *
 * Fail-OPEN. If Redis is unreachable we log and return `allowed: true`.
 * Same policy the session-revocation adapter uses — a Redis outage must
 * not lock legitimate users out. The trade-off is that a Redis outage
 * temporarily disables cost caps; we accept that because Redis outages
 * are rare and cost is bounded by the outage duration.
 *
 * ## Key format
 *
 *   rl:<scope>:<subject>:<windowStart>
 *
 * `windowStart = floor(now/windowSec) * windowSec` — the current window's
 * epoch second boundary. Keys rotate automatically as time advances; TTL
 * on each key is `windowSec` so old keys expire without cleanup.
 *
 * @example
 * ```ts
 * const rl = await checkRateLimit({
 *   redis: server.redis,
 *   scope: "chat.stream",
 *   subject: server.actor.id,
 *   limit: 60,
 *   windowSec: 3600,
 * });
 * if (!rl.allowed) {
 *   return new Response(JSON.stringify({
 *     ok: false,
 *     error: `Rate limit exceeded (${rl.count}/${rl.limit}). Try again after ${rl.resetAt.toISOString()}.`,
 *   }), {
 *     status: 429,
 *     headers: rateLimitHeaders(rl),
 *   });
 * }
 * ```
 */

export interface RateLimitInput {
  readonly redis: Redis;
  /** Namespace for the counter, e.g. `"chat.stream"` or `"voice.token"`. */
  readonly scope: string;
  /** Who is being throttled, typically the user id. */
  readonly subject: string;
  /** How many requests allowed per window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSec: number;
}

export interface RateLimitResult {
  /** True if the request is under the limit; false if it should be rejected. */
  readonly allowed: boolean;
  /** Current count within the active window (includes this request). */
  readonly count: number;
  /** Configured limit, echoed back for observability + headers. */
  readonly limit: number;
  /** Wall-clock time when the current window resets to zero. */
  readonly resetAt: Date;
  /** Seconds until reset — convenient for `Retry-After` header. */
  readonly retryAfterSec: number;
}

export async function checkRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / input.windowSec) * input.windowSec;
  const resetSec = windowStart + input.windowSec;
  const key = `rl:${input.scope}:${input.subject}:${windowStart}`;

  try {
    // INCR is atomic. We set EXPIRE only on the first hit of the
    // window (count === 1) so we don't reset the TTL on every request.
    // Race: if TWO parallel first-hits both see count===1 and both
    // EXPIRE, the effect is idempotent — same TTL either way.
    const count = await input.redis.incr(key);
    if (count === 1) {
      await input.redis.expire(key, input.windowSec);
    }

    return {
      allowed: count <= input.limit,
      count,
      limit: input.limit,
      resetAt: new Date(resetSec * 1000),
      retryAfterSec: Math.max(1, resetSec - nowSec),
    };
  } catch (err) {
    // Fail-OPEN. Log once, allow the request.
    console.warn(
      `[rate-limit] redis error, allowing request (scope=${input.scope} subject=${input.subject}):`,
      (err as Error).message,
    );
    return {
      allowed: true,
      count: 0,
      limit: input.limit,
      resetAt: new Date(resetSec * 1000),
      retryAfterSec: Math.max(1, resetSec - nowSec),
    };
  }
}

/**
 * Build `X-RateLimit-*` + `Retry-After` response headers from a
 * {@link RateLimitResult}. Attach to every response (allowed OR denied)
 * so clients can adaptively back off before they hit the limit.
 */
export function rateLimitHeaders(rl: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rl.limit - rl.count)),
    "X-RateLimit-Reset": String(Math.floor(rl.resetAt.getTime() / 1000)),
    ...(rl.allowed ? {} : { "Retry-After": String(rl.retryAfterSec) }),
  };
}

/**
 * Convenience: build a JSON 429 response with rate-limit headers. Use
 * when the caller isn't already committed to another content type
 * (e.g. SSE routes need to send a JSON error before opening the
 * stream, otherwise switch strategy).
 */
export function jsonRateLimitedResponse(
  rl: RateLimitResult,
  message = "Rate limit exceeded. Please slow down.",
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      code: "rate_limited",
      retryAfterSec: rl.retryAfterSec,
      resetAt: rl.resetAt.toISOString(),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(rl),
      },
    },
  );
}
