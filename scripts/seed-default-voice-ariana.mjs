#!/usr/bin/env node
/**
 * scripts/seed-default-voice-ariana.mjs
 *
 * Makes Cartesia's "Ariana — Kind Friend" the default female character
 * voice, per product decision 2026-08-03:
 *
 *   Voice ID: ec1e269e-9ca0-402f-8a18-58e0e022355a
 *   "Friendly and approachable female voice with a warm, welcoming
 *    tone that builds instant connection."
 *
 * What it does (idempotent — safe to re-run):
 *   1. Upserts a `voice_presets` row for Ariana with sortOrder 0 so it
 *      lists FIRST in the wizard's voice picker (making it the natural
 *      default choice for new characters).
 *   2. Repoints all existing feminine characters (FEMALE, TRANS_WOMAN,
 *      NONBINARY) to the Ariana preset. Masculine characters (MALE,
 *      TRANS_MAN) keep their current male presets — blanket-assigning
 *      a female voice to them would reintroduce the gender-mismatch
 *      bug fixed in voice-call-implementation.md §12.4.
 *
 * Usage:
 *   node scripts/seed-default-voice-ariana.mjs
 *   node scripts/seed-default-voice-ariana.mjs --dry-run
 */

import fs from "node:fs";
import pg from "pg";

const ARIANA = {
  slug: "voice_00_ariana_kind_friend",
  displayName: "Ariana — Kind Friend",
  tone: "Warm & Welcoming",
  provider: "CARTESIA",
  providerVoiceId: "ec1e269e-9ca0-402f-8a18-58e0e022355a",
  language: "en",
};

const FEMININE_GENDERS = ["FEMALE", "TRANS_WOMAN", "NONBINARY"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new pg.Pool({ connectionString: readDirectUrl() });

  console.log("── seed-default-voice-ariana ────────────────────────────");
  console.log(`  voice:   ${ARIANA.displayName} (${ARIANA.providerVoiceId})`);
  console.log(`  dry-run: ${dryRun ? "YES" : "no"}`);
  console.log("");

  try {
    const existing = await pool.query(
      `SELECT id, slug, "providerVoiceId" FROM voice_presets WHERE slug = $1`,
      [ARIANA.slug],
    );
    const affected = await pool.query(
      `SELECT c.id, c.name, c.gender, vp.slug AS current_voice
         FROM characters c
         JOIN voice_presets vp ON vp.id = c."voicePresetId"
        WHERE c.gender = ANY($1)`,
      [FEMININE_GENDERS],
    );

    console.log(
      existing.rows.length > 0
        ? `preset exists (id=${existing.rows[0].id}) — will update in place`
        : "preset missing — will insert",
    );
    console.log(`${affected.rows.length} feminine character(s) to repoint:`);
    for (const r of affected.rows) {
      console.log(`  - ${r.name} (${r.gender}) currently on ${r.current_voice}`);
    }
    console.log("");

    if (dryRun) {
      console.log("dry-run — not writing. Bye.");
      return;
    }

    // 1. Upsert the preset. sortOrder 0 puts it at the top of the
    //    wizard's voice list.
    const preset = await pool.query(
      `INSERT INTO voice_presets
          (id, slug, "displayName", tone, provider, "providerVoiceId",
           language, "sortOrder", "isActive", "createdAt", "updatedAt")
       VALUES
          (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 0, true, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET
          "displayName"     = EXCLUDED."displayName",
          tone              = EXCLUDED.tone,
          provider          = EXCLUDED.provider,
          "providerVoiceId" = EXCLUDED."providerVoiceId",
          "sortOrder"       = 0,
          "isActive"        = true,
          "updatedAt"       = NOW()
       RETURNING id`,
      [
        ARIANA.slug,
        ARIANA.displayName,
        ARIANA.tone,
        ARIANA.provider,
        ARIANA.providerVoiceId,
        ARIANA.language,
      ],
    );
    const presetId = preset.rows[0].id;
    console.log(`✓ preset upserted (id=${presetId})`);

    // 2. Repoint feminine characters.
    const updated = await pool.query(
      `UPDATE characters
          SET "voicePresetId" = $1, "updatedAt" = NOW()
        WHERE gender = ANY($2)
        RETURNING id`,
      [presetId, FEMININE_GENDERS],
    );
    console.log(
      `✓ ${updated.rows.length} character(s) now on ${ARIANA.displayName}`,
    );
    console.log("");
    console.log(
      "Applies on each character's NEXT call (voice is resolved per call-start).",
    );
  } finally {
    await pool.end();
  }
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
