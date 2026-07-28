/**
 * Next.js instrumentation entry point.
 *
 * Runs exactly once when a new Next.js server instance boots (before the
 * server accepts requests). We use it to verify every external dependency —
 * Postgres, required extensions, Redis — is reachable and healthy. Any
 * failure throws, which aborts server startup.
 *
 * See node_modules/next/dist/docs/01-app/02-guides/instrumentation.md
 */

export async function register(): Promise<void> {
  // Preflight uses `pg` and `ioredis`, both Node-only. Skip on Edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runPreflight } = await import(
    "./shared/infrastructure/startup/preflight"
  );
  await runPreflight();
}
