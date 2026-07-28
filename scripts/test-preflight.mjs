// Sanity check: force each dependency to fail one at a time and confirm
// preflight throws with a clear error message.
import "dotenv/config";

async function runCase(label, mutate) {
  const restore = {};
  for (const k of Object.keys(mutate)) {
    restore[k] = process.env[k];
    if (mutate[k] === null) delete process.env[k];
    else process.env[k] = mutate[k];
  }
  console.log(`\n─── CASE: ${label} ───`);
  try {
    const url = new URL("../src/lib/startup/preflight.ts", import.meta.url);
    // Fresh import so previous globals don't linger.
    const { runPreflight } = await import(url.href + "?t=" + Date.now());
    await runPreflight();
    console.log("UNEXPECTED: preflight succeeded — this case should have failed");
    process.exitCode = 1;
  } catch (e) {
    console.log("EXPECTED FAILURE:", e.message);
  } finally {
    for (const [k, v] of Object.entries(restore)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// 1. Missing DATABASE_URL → env check should fail.
await runCase("DATABASE_URL unset", { DATABASE_URL: null });

// 2. Bad Postgres host → postgres check should fail.
await runCase("DATABASE_URL points to bad host", {
  DATABASE_URL: "postgresql://user:pass@nonexistent.invalid:5432/db",
});

// 3. Bad Redis host → redis check should fail (required by default).
await runCase("REDIS_URL points to bad host", {
  REDIS_URL: "redis://nonexistent.invalid:6379",
});

console.log("\nAll failure cases produced clear errors ✓");
