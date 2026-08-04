#!/usr/bin/env node
/**
 * scripts/tune-voice-length.mjs
 *
 * Lowers the voice-mode LLM's `max_tokens` so replies feel snappy
 * instead of dumping 60-token paragraphs the user has to sit through.
 *
 * Rationale
 *   Audit of 2026-08-04 call session abe1a7b7… showed 7 turns averaging
 *   50-60 completion tokens each. That's 12-15 seconds of TTS audio per
 *   turn — long enough that users start saying "Hello? Hello?" thinking
 *   the character stopped listening. Halving the ceiling to 100 tokens
 *   preserves headroom to complete a sentence but shrinks the average
 *   reply to something closer to a real phone conversation.
 *
 * Usage
 *   node scripts/tune-voice-length.mjs                # → sets max_tokens=100
 *   node scripts/tune-voice-length.mjs --max 80       # → sets max_tokens=80
 *   node scripts/tune-voice-length.mjs --dry-run
 *
 * Preserves every other parameter (temperature, top_p, provider prefs,
 * fallback models list). Restart the Next.js dev server for the change
 * to apply on the very next turn (60s in-process cache otherwise).
 *
 * Env loading
 *   Reads DIRECT_URL directly from .env — bypasses any wrapper that
 *   might corrupt it in the shell (matches switch-chat-model.mjs).
 */

import fs from "node:fs";
import pg from "pg";

const DEFAULT_MAX_TOKENS = 100;
const PURPOSE = "VOICE_LLM";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maxTokens = Number(args.max ?? DEFAULT_MAX_TOKENS);
  const dryRun = args["dry-run"] === true;

  if (!Number.isFinite(maxTokens) || maxTokens < 20 || maxTokens > 500) {
    console.error(`✗ --max must be an integer between 20 and 500 (got ${args.max})`);
    process.exit(1);
  }

  console.log("── tune-voice-length ──────────────────────────────────────");
  console.log(`  purpose:    ${PURPOSE}`);
  console.log(`  max_tokens: ${maxTokens}`);
  console.log(`  dry-run:    ${dryRun ? "YES" : "no"}`);
  console.log("");

  const url = readDirectUrl();
  const pool = new pg.Pool({ connectionString: url });

  try {
    const before = await pool.query(
      `SELECT "modelId", "parameters", "updatedAt"
         FROM model_configs
        WHERE "purpose" = $1
        LIMIT 1`,
      [PURPOSE],
    );
    if (before.rows.length === 0) {
      console.error(`✗ No model_configs row for purpose='${PURPOSE}'.`);
      process.exit(1);
    }

    const currentParams = before.rows[0].parameters ?? {};
    console.log("current row:");
    console.log("  modelId:            ", before.rows[0].modelId);
    console.log("  current max_tokens: ", currentParams.max_tokens ?? "(unset)");
    console.log(
      "  updatedAt:          ",
      before.rows[0].updatedAt?.toISOString?.() ?? before.rows[0].updatedAt,
    );
    console.log("");

    if (dryRun) {
      console.log("dry-run — not writing. Bye.");
      return;
    }

    const params = { ...currentParams, max_tokens: maxTokens };

    const after = await pool.query(
      `UPDATE model_configs
          SET "parameters" = $1,
              "updatedAt" = NOW()
        WHERE "purpose" = $2
        RETURNING "modelId", "parameters", "updatedAt"`,
      [JSON.stringify(params), PURPOSE],
    );

    console.log("✓ updated:");
    console.log("  modelId:            ", after.rows[0].modelId);
    console.log("  new max_tokens:     ", after.rows[0].parameters?.max_tokens);
    console.log(
      "  updatedAt:          ",
      after.rows[0].updatedAt?.toISOString?.() ?? after.rows[0].updatedAt,
    );
    console.log("");
    console.log(
      "Note: ctx.models.resolve() caches for 60s in-process. Restart the",
    );
    console.log("Next.js dev server for the change to apply on the next call.");
  } finally {
    await pool.end();
  }
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

function readDirectUrl() {
  const raw = fs.readFileSync(".env", "utf8");
  const m = raw.match(/^DIRECT_URL=(.+)$/m);
  if (!m) throw new Error("DIRECT_URL not found in .env");
  return m[1].trim();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
