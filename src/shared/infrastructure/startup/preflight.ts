import "server-only";
import { Client as PgClient } from "pg";
import IORedis from "ioredis";
import { env } from "@/config/env";

/**
 * Startup preflight — verify every external dependency is reachable and
 * correctly configured before Next.js begins serving requests. Any failure
 * throws, which aborts server startup — this is intentional: a broken
 * dependency should surface loudly at boot, not as a stream of 500s.
 *
 * Wired from `src/instrumentation.ts` via Next.js's `register()` hook, so it
 * runs exactly once when a new server instance is initialised.
 *
 * Skips:
 *   - Edge runtime (Postgres / Redis clients don't work there)
 *   - `next build` phase (nothing to preflight during a static build)
 *   - `STARTUP_SKIP_PREFLIGHT=1` (escape hatch for local emergencies)
 */

const REQUIRED_EXTENSIONS = [
  "vector",
  "pg_trgm",
  "pgcrypto",
  "unaccent",
] as const;

const CONNECT_TIMEOUT_MS = 10_000;

interface PreflightOptions {
  requireRedis?: boolean;
}

class PreflightError extends Error {
  constructor(step: string, message: string) {
    super(`[preflight:${step}] ${message}`);
    this.name = "PreflightError";
  }
}

function log(step: string, message: string) {
  console.log(`[preflight] ${step.padEnd(12)} ${message}`);
}

function shouldSkip(): boolean {
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return true;
  if (env.NEXT_PHASE === "phase-production-build") return true;
  if (env.STARTUP_SKIP_PREFLIGHT) return true;
  return false;
}

async function checkPostgres(): Promise<void> {
  const client = new PgClient({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: CONNECT_TIMEOUT_MS,
  });

  try {
    await client.connect();
    const versionRes = await client.query<{ version: string }>(
      "SELECT version() AS version",
    );
    const banner = versionRes.rows[0]?.version.split(",")[0] ?? "unknown";
    log("postgres", `connected (${banner})`);

    const extRes = await client.query<{ extname: string }>(
      `SELECT extname
         FROM pg_extension
        WHERE extname = ANY($1::text[])
        ORDER BY extname`,
      [REQUIRED_EXTENSIONS as unknown as string[]],
    );
    const installed = new Set(extRes.rows.map((r) => r.extname));
    const missing = REQUIRED_EXTENSIONS.filter((n) => !installed.has(n));

    if (missing.length) {
      throw new PreflightError(
        "postgres",
        `missing extensions: ${missing.join(", ")}. ` +
          "Run `npx prisma migrate deploy` to install them, or install " +
          "manually via `CREATE EXTENSION <name> WITH SCHEMA extensions;`.",
      );
    }
    log("postgres", `extensions ok: ${REQUIRED_EXTENSIONS.join(", ")}`);

    const migRes = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = '_prisma_migrations'`,
    );
    if ((migRes.rows[0]?.n ?? 0) === 0) {
      throw new PreflightError(
        "postgres",
        "no Prisma migrations have been applied. Run `npx prisma migrate deploy` first.",
      );
    }
    log("postgres", "migration table present");
  } catch (err) {
    if (err instanceof PreflightError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new PreflightError("postgres", `connection failed — ${message}`);
  } finally {
    try {
      await client.end();
    } catch {
      /* best-effort cleanup */
    }
  }
}

async function checkRedis(requireRedis: boolean): Promise<void> {
  const client = new IORedis(env.REDIS_URL, {
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });

  client.on("error", () => {});

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== "PONG") {
      throw new PreflightError("redis", `unexpected PING response: ${pong}`);
    }

    const key = `preflight:canary:${Date.now()}`;
    await client.set(key, "1", "EX", 30);
    const value = await client.get(key);
    await client.del(key);
    if (value !== "1") {
      throw new PreflightError(
        "redis",
        `canary key round-trip failed (got ${value})`,
      );
    }

    const info = await client.info("server");
    const version = /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? "unknown";
    log("redis", `connected (redis ${version})`);
  } catch (err) {
    if (err instanceof PreflightError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (requireRedis) {
      throw new PreflightError("redis", `connection failed — ${message}`);
    }
    log("redis", `WARN unreachable — ${message}`);
  } finally {
    client.disconnect();
  }
}

export async function runPreflight(
  options: PreflightOptions = {},
): Promise<void> {
  if (shouldSkip()) {
    log("skip", "preflight bypassed (edge / build / STARTUP_SKIP_PREFLIGHT)");
    return;
  }

  const requireRedis =
    options.requireRedis ?? (env.STARTUP_REQUIRE_REDIS !== "0");

  const started = Date.now();
  log("boot", "verifying required infrastructure…");

  await checkPostgres();
  await checkRedis(requireRedis);

  log("boot", `all checks passed in ${Date.now() - started}ms`);
}
