import "dotenv/config";
import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL not set");
  process.exit(1);
}

console.log("URL:", url.replace(/:[^@:/]+@/, ":****@"));
const redis = new Redis(url, {
  connectTimeout: 10000,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

try {
  await redis.connect();
  const pong = await redis.ping();
  console.log("PING:", pong);

  const key = `preflight:canary:${Date.now()}`;
  await redis.set(key, "ok", "EX", 10);
  const v = await redis.get(key);
  await redis.del(key);
  console.log("SET/GET/DEL canary:", v);

  const info = await redis.info("server");
  const version = /redis_version:([^\r\n]+)/.exec(info)?.[1];
  console.log("Redis version:", version);
  process.exit(0);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  redis.disconnect();
}
