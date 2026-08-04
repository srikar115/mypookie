#!/usr/bin/env node
/**
 * scripts/bench-redis-caches.mjs
 *
 * Synthetic benchmark for the two Redis caches shipped in the P0
 * performance pass:
 *
 *   1. Embedding cache  (CachedEmbeddingLlm)
 *   2. Memory-block cache (CachedMemoryContextProvider)
 *
 * The point isn't to prove Redis is fast (it is). The point is to
 * produce concrete before/after numbers you can quote:
 *
 *   "Before: 187 ms average per call. After: 3 ms average on cache
 *    hit. 98% reduction on hit."
 *
 * ## What it does
 *
 * For each cache we run three passes:
 *
 *   PASS A — Cold cache. Force-flush all cache keys, then call the
 *            decorator like the app would. Simulates the underlying
 *            work with a realistic delay (Deepgram/OpenAI have
 *            typical embed latencies of ~120 ms; memory-block
 *            assembly is 200–600 ms based on the 2026-08-04 audit).
 *
 *   PASS B — Warm cache. Repeat PASS A's inputs without flushing.
 *            Every request should hit the cache.
 *
 *   PASS C — Mixed workload. 70% of requests hit warm keys, 30% are
 *            fresh — realistic production shape based on the docstring
 *            estimate of 30–50% embedding-cache hit rate.
 *
 * ## Usage
 *
 *   node scripts/bench-redis-caches.mjs
 *   node scripts/bench-redis-caches.mjs --iterations 200
 *   node scripts/bench-redis-caches.mjs --skip-flush   # don't clear cache first
 *
 * Requires: REDIS_URL in .env. Uses no LLM providers — the "underlying
 * work" is a `setTimeout` delay matching real provider latencies.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import Redis from "ioredis";

const DEFAULT_ITERATIONS = 100;
const SIMULATED_EMBED_LATENCY_MS = 150;
const SIMULATED_MEMORY_LATENCY_MS = 350;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const iterations = Number(args.iterations ?? DEFAULT_ITERATIONS);
  const skipFlush = args["skip-flush"] === true;

  const redisUrl = readEnvVar("REDIS_URL");
  const redis = new Redis(redisUrl, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 2,
  });

  console.log("── redis cache benchmark ─────────────────────────────────");
  console.log(`  iterations per pass: ${iterations}`);
  console.log(`  simulated embed latency:  ${SIMULATED_EMBED_LATENCY_MS} ms`);
  console.log(`  simulated memory latency: ${SIMULATED_MEMORY_LATENCY_MS} ms`);
  console.log(`  redis:               ${redisUrl.replace(/:[^@]+@/, ":***@")}`);
  console.log("");

  try {
    await redis.ping();
  } catch (err) {
    console.error(`✗ Redis unreachable: ${err.message}`);
    process.exit(1);
  }

  if (!skipFlush) {
    console.log("clearing test keys (bench:*, embed:v1:*, mem:v1:*) ...");
    await deleteKeysByPattern(redis, "bench:*");
    // We use dedicated bench keys so we don't clobber real app caches
    // that may already have production entries when the app is running.
  }

  const embedResults = await benchEmbedCache(redis, iterations);
  const memResults = await benchMemoryCache(redis, iterations);

  printSummary(embedResults, memResults);

  await redis.quit();
}

// ─── EMBEDDING CACHE ────────────────────────────────────────────────

async function benchEmbedCache(redis, iterations) {
  console.log("\n[1/2] embedding cache");
  console.log("─────────────────────────────────────────────────────────");

  const cache = makeEmbedCacheBench(redis);
  const uniqueTexts = generateTexts(20); // 20 distinct utterances

  // PASS A — cold cache (every request is a miss)
  await deleteKeysByPattern(redis, "bench:embed:*");
  const coldTimes = [];
  for (let i = 0; i < iterations; i++) {
    const t = uniqueTexts[i % uniqueTexts.length];
    const started = process.hrtime.bigint();
    // Force miss by using a unique text on every iteration.
    await cache.embed([`cold-${i}-${t}`]);
    coldTimes.push(hrDeltaMs(started));
  }

  // PASS B — warm cache (every request hits)
  const warmTimes = [];
  // Prime cache with unique texts.
  for (const t of uniqueTexts) await cache.embed([t]);
  for (let i = 0; i < iterations; i++) {
    const t = uniqueTexts[i % uniqueTexts.length];
    const started = process.hrtime.bigint();
    await cache.embed([t]);
    warmTimes.push(hrDeltaMs(started));
  }

  // PASS C — mixed 70% warm / 30% cold
  const mixedTimes = [];
  const missRate = 0.3;
  for (let i = 0; i < iterations; i++) {
    const isMiss = Math.random() < missRate;
    const text = isMiss
      ? `mixed-${crypto.randomUUID()}-${uniqueTexts[i % uniqueTexts.length]}`
      : uniqueTexts[i % uniqueTexts.length];
    const started = process.hrtime.bigint();
    await cache.embed([text]);
    mixedTimes.push(hrDeltaMs(started));
  }

  const cold = summarise(coldTimes);
  const warm = summarise(warmTimes);
  const mixed = summarise(mixedTimes);

  console.log(`  cold  (all miss): ${fmtRow(cold)}`);
  console.log(`  warm  (all hit):  ${fmtRow(warm)}`);
  console.log(`  mixed (30% miss): ${fmtRow(mixed)}`);

  return { cold, warm, mixed };
}

function makeEmbedCacheBench(redis) {
  // Mirrors CachedEmbeddingLlm shape but uses simulated work in place
  // of an actual embedding provider — the point is Redis path timing,
  // not embedding correctness.
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const keys = texts.map((t) => `bench:embed:${sha32(t)}`);
      const cached = await redis.mget(...keys);
      const missIdx = [];
      const missTexts = [];
      for (let i = 0; i < texts.length; i++) {
        if (cached[i] === null) {
          missIdx.push(i);
          missTexts.push(texts[i]);
        }
      }
      if (missTexts.length > 0) {
        // Simulate one batched provider call.
        await sleep(SIMULATED_EMBED_LATENCY_MS);
        const pipeline = redis.pipeline();
        for (let i = 0; i < missTexts.length; i++) {
          const fakeVec = new Array(1024).fill(0.1);
          pipeline.set(
            keys[missIdx[i]],
            JSON.stringify(fakeVec),
            "EX",
            60,
          );
        }
        await pipeline.exec();
      }
      return texts.map(() => []);
    },
  };
}

// ─── MEMORY-BLOCK CACHE ─────────────────────────────────────────────

async function benchMemoryCache(redis, iterations) {
  console.log("\n[2/2] memory-block cache");
  console.log("─────────────────────────────────────────────────────────");

  const cache = makeMemoryCacheBench(redis);
  const uniqueMessages = generateTexts(15); // 15 distinct utterances

  const inputBase = {
    userId: "bench-user-1",
    characterId: "bench-char-1",
    conversationId: "bench-conv-1",
    userDisplayName: "Bench",
  };

  // PASS A — cold
  await deleteKeysByPattern(redis, "bench:mem:*");
  const coldTimes = [];
  for (let i = 0; i < iterations; i++) {
    const started = process.hrtime.bigint();
    await cache.getMemoryBlock({
      ...inputBase,
      userMessage: `cold-${i}-${uniqueMessages[i % uniqueMessages.length]}`,
    });
    coldTimes.push(hrDeltaMs(started));
  }

  // PASS B — warm
  const warmTimes = [];
  for (const msg of uniqueMessages) {
    await cache.getMemoryBlock({ ...inputBase, userMessage: msg });
  }
  for (let i = 0; i < iterations; i++) {
    const started = process.hrtime.bigint();
    await cache.getMemoryBlock({
      ...inputBase,
      userMessage: uniqueMessages[i % uniqueMessages.length],
    });
    warmTimes.push(hrDeltaMs(started));
  }

  // PASS C — mixed 70/30
  const mixedTimes = [];
  const missRate = 0.3;
  for (let i = 0; i < iterations; i++) {
    const isMiss = Math.random() < missRate;
    const userMessage = isMiss
      ? `mixed-${crypto.randomUUID()}-${uniqueMessages[i % uniqueMessages.length]}`
      : uniqueMessages[i % uniqueMessages.length];
    const started = process.hrtime.bigint();
    await cache.getMemoryBlock({ ...inputBase, userMessage });
    mixedTimes.push(hrDeltaMs(started));
  }

  const cold = summarise(coldTimes);
  const warm = summarise(warmTimes);
  const mixed = summarise(mixedTimes);

  console.log(`  cold  (all miss): ${fmtRow(cold)}`);
  console.log(`  warm  (all hit):  ${fmtRow(warm)}`);
  console.log(`  mixed (30% miss): ${fmtRow(mixed)}`);

  return { cold, warm, mixed };
}

function makeMemoryCacheBench(redis) {
  return {
    async getMemoryBlock(input) {
      const key = `bench:mem:${sha32(
        [
          input.userId,
          input.characterId,
          input.conversationId,
          input.userMessage.trim().replace(/\s+/g, " "),
          input.userDisplayName ?? "",
        ].join("\x00"),
      )}`;
      const cached = await redis.get(key);
      if (cached !== null) return cached;
      // Simulate the full memory assembly work.
      await sleep(SIMULATED_MEMORY_LATENCY_MS);
      const fakeBlock = `USER PROFILE\nName: Bench\n\nRELEVANT MEMORIES\n- ${input.userMessage}`;
      await redis.set(key, fakeBlock, "EX", 60);
      return fakeBlock;
    },
  };
}

// ─── SUMMARY ────────────────────────────────────────────────────────

function printSummary(embed, mem) {
  console.log("\n═════ SUMMARY — before/after per-request latency ═════════");
  console.log("");
  console.log("EMBEDDING CACHE");
  console.log("  before (cold):     " + fmtRow(embed.cold));
  console.log("  after  (all hit):  " + fmtRow(embed.warm));
  console.log(
    "  reduction on hit:  " +
      pctReduction(embed.cold.avgMs, embed.warm.avgMs) +
      " (avg)",
  );
  console.log("  realistic (70/30): " + fmtRow(embed.mixed));
  console.log(
    "  realistic saving:  " +
      pctReduction(embed.cold.avgMs, embed.mixed.avgMs) +
      " (vs all-cold baseline)",
  );
  console.log("");
  console.log("MEMORY-BLOCK CACHE");
  console.log("  before (cold):     " + fmtRow(mem.cold));
  console.log("  after  (all hit):  " + fmtRow(mem.warm));
  console.log(
    "  reduction on hit:  " +
      pctReduction(mem.cold.avgMs, mem.warm.avgMs) +
      " (avg)",
  );
  console.log("  realistic (70/30): " + fmtRow(mem.mixed));
  console.log(
    "  realistic saving:  " +
      pctReduction(mem.cold.avgMs, mem.mixed.avgMs) +
      " (vs all-cold baseline)",
  );
  console.log("");
  console.log("Numbers are per-request wall clock, including Redis I/O.");
  console.log(
    `Underlying provider is SIMULATED at ${SIMULATED_EMBED_LATENCY_MS}/${SIMULATED_MEMORY_LATENCY_MS}ms;`,
  );
  console.log(
    "real production hits will vary with actual OpenAI + Postgres latency.",
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────

function summarise(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    count: sorted.length,
    avgMs: avg(sorted),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

function fmtRow(s) {
  return `avg=${fmt(s.avgMs)}ms p50=${fmt(s.p50Ms)}ms p95=${fmt(s.p95Ms)}ms p99=${fmt(s.p99Ms)}ms n=${s.count}`;
}

function pctReduction(before, after) {
  if (before <= 0) return "n/a";
  const pct = ((before - after) / before) * 100;
  return `${pct.toFixed(1)}%`;
}

function fmt(n) {
  return n.toFixed(1).padStart(6);
}

function avg(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function generateTexts(n) {
  const seeds = [
    "hey",
    "how are you",
    "what are you doing",
    "you there?",
    "mm",
    "yeah",
    "I miss you",
    "tell me about your day",
    "what did you have for lunch",
    "are you okay",
    "how was work",
    "hi",
    "what's up",
    "i love you",
    "goodnight",
    "wait what",
    "seriously?",
    "no way",
    "haha stop",
    "come here",
  ];
  return Array.from({ length: n }, (_, i) => seeds[i % seeds.length]);
}

function sha32(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

async function deleteKeysByPattern(redis, pattern) {
  const stream = redis.scanStream({ match: pattern, count: 500 });
  const pipeline = redis.pipeline();
  let deleted = 0;
  for await (const keys of stream) {
    for (const k of keys) {
      pipeline.del(k);
      deleted++;
    }
  }
  if (deleted > 0) await pipeline.exec();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hrDeltaMs(startedBigint) {
  return Number(process.hrtime.bigint() - startedBigint) / 1_000_000;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function readEnvVar(name) {
  const raw = fs.readFileSync(".env", "utf8");
  const m = raw.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!m) throw new Error(`${name} not found in .env`);
  return m[1].trim();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
