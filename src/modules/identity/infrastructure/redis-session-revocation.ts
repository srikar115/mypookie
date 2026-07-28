import "server-only";
import type Redis from "ioredis";
import type { SessionRevocationPort } from "../application/ports/session-revocation";
import { SESSION_MAX_AGE_SECONDS } from "./nextauth-config";

/**
 * Redis-backed SessionRevocation adapter.
 *
 * Storage model: one string key per revoked user, e.g.
 *
 *   session-revoked:<userId>  →  "1"    (TTL = SESSION_MAX_AGE_SECONDS)
 *
 * The TTL matches the maximum session lifetime because any JWT still bearing
 * this user id after that window would already be expired — so the entry can
 * safely self-collect.
 *
 * Failure policy: `isRevoked` returns `false` on Redis errors. This is
 * "fail-open" — a Redis outage does not lock legitimate users out, at the
 * cost of a brief moderation window if Redis is unreachable at the exact
 * moment a suspension lands. If your risk model calls for fail-closed,
 * flip the return to `true` and add a health-based bypass for operators.
 */
export class RedisSessionRevocation implements SessionRevocationPort {
  constructor(private readonly redis: Redis) {}

  async revokeUser(userId: string): Promise<void> {
    await this.redis.set(
      keyFor(userId),
      "1",
      "EX",
      SESSION_MAX_AGE_SECONDS,
    );
  }

  async reinstateUser(userId: string): Promise<void> {
    await this.redis.del(keyFor(userId));
  }

  async isRevoked(userId: string): Promise<boolean> {
    try {
      const hit = await this.redis.exists(keyFor(userId));
      return hit === 1;
    } catch (error) {
      // Fail open. Logging once is enough — the transient will be visible
      // in Redis/ops dashboards and shouldn't spam our app logs.
      console.error(
        "[session-revocation] Redis check failed, allowing session:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}

function keyFor(userId: string): string {
  return `session-revoked:${userId}`;
}
