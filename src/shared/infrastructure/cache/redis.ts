import "server-only";
import Redis, { type RedisOptions } from "ioredis";
import { env } from "@/config/env";

/**
 * Singleton Redis client shared across the Next.js server.
 *
 * Used for:
 *   - Rate limiting (per-user quotas)
 *   - Job queue (BullMQ later, for image/video generation)
 *   - Ephemeral SSE stream buffers (multi-instance safe)
 *   - "Hot" working memory cache (last N chat turns of an active convo)
 *
 * ioredis reconnects automatically on transient failures, so a single client
 * is safe to keep alive for the lifetime of the process.
 */

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedis(): Redis {
  const options: RedisOptions = {
    connectTimeout: 10_000,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
    reconnectOnError: (err) => err.message.includes("READONLY"),
    lazyConnect: false,
  };

  const client = new Redis(env.REDIS_URL, options);

  client.on("error", (err) => {
    console.error("[redis] error:", err.message);
  });

  return client;
}

export const redis: Redis = globalForRedis.redis ?? createRedis();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export default redis;
