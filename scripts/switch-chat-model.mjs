#!/usr/bin/env node
/**
 * scripts/switch-chat-model.mjs
 *
 * Runtime tool for swapping the primary CHAT model and its
 * OpenRouter-side fallback chain WITHOUT a Prisma migration.
 *
 * Rationale — why not a migration?
 *   Model choice is an operational concern, not a schema change. It
 *   moves faster than the migration cadence should, it belongs to
 *   whoever runs ops (not the migration reviewer), and its history is
 *   better captured in this script's git log + a chat-provider audit
 *   log than in `_prisma_migrations` (which reads like a "we changed
 *   our mind again" novel if we keep doing this by migration).
 *
 * Usage:
 *   node scripts/switch-chat-model.mjs
 *     Applies the built-in defaults (see DEFAULT_* below).
 *
 *   node scripts/switch-chat-model.mjs \
 *     --primary sao10k/l3.1-euryale-70b \
 *     --fallback sao10k/l3.3-euryale-70b
 *     Explicit override; useful for A/B tests or emergency rollbacks.
 *
 *   node scripts/switch-chat-model.mjs --dry-run
 *     Prints the before/after diff without touching the row.
 *
 *   node scripts/switch-chat-model.mjs --purpose CHAT_TAGLINE
 *     Targets a different purpose row. Defaults to CHAT.
 *
 * Cache note:
 *   `ctx.models.resolve("CHAT")` caches the resolved config in-process
 *   for 60 seconds. After running this script, either restart the dev
 *   server (immediate effect) or wait ~60s (next resolve picks it up).
 *
 * Env loading:
 *   Reads DIRECT_URL directly from .env — bypasses whatever env
 *   injection layer the shell might have (the vestauth wrapper has
 *   been observed to corrupt DIRECT_URL in some contexts).
 */

import fs from "node:fs";
import pg from "pg";

const DEFAULT_PRIMARY = "sao10k/l3.1-euryale-70b";
const DEFAULT_FALLBACK = "sao10k/l3.3-euryale-70b";
const DEFAULT_PURPOSE = "CHAT";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const primary = args.primary ?? DEFAULT_PRIMARY;
  const fallback = args.fallback ?? DEFAULT_FALLBACK;
  const purpose = args.purpose ?? DEFAULT_PURPOSE;
  const dryRun = args["dry-run"] === true;

  console.log("── switch-chat-model ─────────────────────────────────────");
  console.log(`  purpose:   ${purpose}`);
  console.log(`  primary:   ${primary}`);
  console.log(`  fallback:  ${fallback}`);
  console.log(`  dry-run:   ${dryRun ? "YES" : "no"}`);
  console.log("");

  const url = readDirectUrl();
  const pool = new pg.Pool({ connectionString: url });

  try {
    const before = await pool.query(
      `SELECT "modelId", "parameters", "updatedAt"
         FROM model_configs
        WHERE "purpose" = $1
        LIMIT 1`,
      [purpose],
    );
    if (before.rows.length === 0) {
      console.error(`✗ No model_configs row for purpose='${purpose}'.`);
      process.exit(1);
    }

    console.log("current row:");
    console.log("  modelId:  ", before.rows[0].modelId);
    console.log(
      "  models:   ",
      JSON.stringify(before.rows[0].parameters?.models ?? null),
    );
    console.log("  updatedAt:", before.rows[0].updatedAt?.toISOString?.() ?? before.rows[0].updatedAt);
    console.log("");

    if (dryRun) {
      console.log("dry-run — not writing. Bye.");
      return;
    }

    // Preserve every other parameter (temperature, top_p, max_tokens,
    // provider preferences, etc.) — only touch modelId + models[].
    const params = { ...(before.rows[0].parameters ?? {}) };
    params.models = [primary, fallback];

    const after = await pool.query(
      `UPDATE model_configs
          SET "modelId" = $1,
              "parameters" = $2,
              "updatedAt" = NOW()
        WHERE "purpose" = $3
        RETURNING "modelId", "parameters", "updatedAt"`,
      [primary, JSON.stringify(params), purpose],
    );

    console.log("✓ updated:");
    console.log("  modelId:  ", after.rows[0].modelId);
    console.log(
      "  models:   ",
      JSON.stringify(after.rows[0].parameters?.models ?? null),
    );
    console.log("  updatedAt:", after.rows[0].updatedAt?.toISOString?.() ?? after.rows[0].updatedAt);
    console.log("");
    console.log(
      "Note: ctx.models.resolve() caches for 60s in-process. Restart the",
    );
    console.log("dev server for the change to apply on the very next turn.");
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
