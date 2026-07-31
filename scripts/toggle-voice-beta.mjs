#!/usr/bin/env node
/**
 * scripts/toggle-voice-beta.mjs
 *
 * Flip the `users.voiceCallsBeta` allowlist flag for a specific user.
 * Used during the first two weeks of voice-call rollout so we can
 * onboard beta testers one at a time without exposing the feature to
 * the whole user base.
 *
 * Usage:
 *   node scripts/toggle-voice-beta.mjs --email me@example.com --on
 *   node scripts/toggle-voice-beta.mjs --email me@example.com --off
 *   node scripts/toggle-voice-beta.mjs --list             # show current allowlist
 *
 * Once we're confident in provider bills and drop-reason distribution,
 * flip VOICE_CALLS_ENABLED=true and NEXT_PUBLIC_VOICE_CALLS_ENABLED=true
 * globally and this flag becomes a no-op.
 */

import fs from "node:fs";
import pg from "pg";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = readDirectUrl();
  const pool = new pg.Pool({ connectionString: url });

  try {
    if (args.list) {
      const res = await pool.query(
        `SELECT "email", "voiceCallsBeta", "createdAt"
           FROM users
          WHERE "voiceCallsBeta" = TRUE
          ORDER BY "createdAt" DESC`,
      );
      console.log("── voice-beta allowlist ─────────────────");
      if (res.rows.length === 0) {
        console.log("  (empty)");
      } else {
        for (const row of res.rows) {
          console.log(`  ${row.email}`);
        }
      }
      return;
    }

    const email = args.email;
    if (!email) {
      console.error("Usage: --email me@example.com --on|--off  OR  --list");
      process.exit(1);
    }

    const enable = args.on === true;
    const disable = args.off === true;
    if (enable === disable) {
      console.error("Specify exactly one of --on / --off");
      process.exit(1);
    }

    const res = await pool.query(
      `UPDATE users
          SET "voiceCallsBeta" = $2,
              "updatedAt" = NOW()
        WHERE "email" = $1
        RETURNING "email", "voiceCallsBeta"`,
      [email, enable],
    );
    if (res.rows.length === 0) {
      console.error(`✗ No user found with email=${email}`);
      process.exit(1);
    }
    const row = res.rows[0];
    console.log(
      `✓ ${row.email} → voiceCallsBeta=${row.voiceCallsBeta ? "ON" : "OFF"}`,
    );
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
