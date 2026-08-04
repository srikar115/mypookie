import "server-only";

/**
 * Public entry point for the rate-limiting infrastructure. Route
 * handlers should import from here rather than reaching into concrete
 * implementations.
 */
export {
  checkRateLimit,
  jsonRateLimitedResponse,
  rateLimitHeaders,
  type RateLimitInput,
  type RateLimitResult,
} from "./redis-rate-limiter";

/**
 * Centralised limit policy. Kept in one file so we can tune ceilings
 * without hunting through route handlers, and so a policy review only
 * needs to read this table.
 *
 * Ceilings target the FREE tier. Paid-tier callers should bypass by
 * checking `actor.role` (or a subscription flag once billing lands).
 * Ratios roughly match the canvas review — chat 60/hr, voice 5 min/day,
 * etc — with a scope for every cost-heavy route.
 *
 * Windows are chosen so users see a smooth per-hour or per-day
 * experience, not per-second bursts they can't feel.
 */
export const RATE_LIMITS = {
  /** SSE chat turn: 1 minute window balances burst typing vs abuse. */
  "chat.stream": { limit: 30, windowSec: 60 },
  /** Chat opener: cheap, but rebounds shouldn't hammer OpenRouter. */
  "chat.opener": { limit: 20, windowSec: 60 },
  /** Voice call start (token mint): 5 fresh calls per hour is generous. */
  "voice.token": { limit: 5, windowSec: 60 * 60 },
  /** Voice context fetch (agent): 1 per second is the natural cap. */
  "voice.context": { limit: 60, windowSec: 60 },
  /** Voice turn persistence (agent): every user utterance goes here. */
  "voice.turn": { limit: 60, windowSec: 60 },
  /** Voice call end: called at most once per call. */
  "voice.end": { limit: 20, windowSec: 60 },
} as const satisfies Record<string, { limit: number; windowSec: number }>;

export type RateLimitScope = keyof typeof RATE_LIMITS;
