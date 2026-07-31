#!/usr/bin/env node
/**
 * scripts/seed-cartesia-voice-presets.mjs
 *
 * Overwrites the 9 mock voice_presets rows with real Cartesia Emotive-tier
 * voice UUIDs. Idempotent — safe to re-run.
 *
 * WHY:
 *   Every character has a `voicePresetId` FK to a voice_presets row.
 *   Before this script, those rows all pointed at `MOCK_TTS` with
 *   placeholder `mock-voice-XX-*` IDs, so the voice pipeline could
 *   only fall back to the env-var gender picker — meaning every
 *   female character sounded identical, every male character
 *   sounded identical. That killed the "each character is her own
 *   person" product feel.
 *
 * WHAT WE'RE DOING:
 *   Assigning each of the 9 tone slots (Confident, Cheerful, Dominant,
 *   Innocent, Sweet, Sultry, Calm, Thoughtful, Whimsical) to one of
 *   Cartesia's 8 documented Emotive-tier voices. UUIDs come straight
 *   from Cartesia's official emotion/volume/speed docs:
 *     https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 *
 * HOW WIZARD-SIDE ASSIGNMENT WORKS:
 *   The character creation wizard already picks a `voicePresetId`
 *   during the "Character" step (relationship/personality/occupation
 *   step). Once these rows carry real Cartesia UUIDs, that pick
 *   automatically flows through to the voice pipeline via
 *   `BuildVoiceContextUseCase.resolveVoiceId` — no code change needed.
 *
 * Usage:
 *   node scripts/seed-cartesia-voice-presets.mjs
 *   node scripts/seed-cartesia-voice-presets.mjs --dry-run
 *
 * Env:
 *   Reads DIRECT_URL directly from .env — bypasses shell env injection.
 */

import fs from "node:fs";
import pg from "pg";

// ── Cartesia Emotive-tier catalogue ────────────────────────────────────────
// All 8 UUIDs are from Cartesia's official "voices with best emotional
// response" list. Sonic-3.5 synthesizes real laughter, sighs, and
// tonal shifts on these vs. the flat delivery you get from the
// Stable-tier voices used for support-desk agents.
const CARTESIA = {
  // Female emotive voices
  tessa: { id: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", note: "warm, playful, laughter" },
  maya: { id: "cbaf8084-f009-4838-a096-07ee2e6612b1", note: "sultry, low, expressive" },
  dana: { id: "cc00e582-ed66-4004-8336-0175b85c85f6", note: "bright, sweet, young" },
  marian: { id: "26403c37-80c1-4a1a-8692-540551ca2ae5", note: "calm, mature, thoughtful" },
  // Male emotive voices
  kyle: { id: "c961b81c-a935-4c17-bfb3-ba2239de8c2f", note: "grounded, playful, warm" },
  leo: { id: "0834f3df-e650-4766-a20c-5a93a43aa6e3", note: "deep, commanding, confident" },
  jace: { id: "6776173b-fd72-460d-89b3-d85812ee518d", note: "steady, calm, thoughtful" },
  gavin: { id: "f4a3a8e4-694c-4c45-9ca0-27caf97901b5", note: "energetic, warm, whimsical" },
};

// ── Tone-slot mapping ──────────────────────────────────────────────────────
// Preserves the existing 9 slugs & tone labels so ALREADY-CREATED characters
// keep their preset assignment (voicePresetId references stay valid), but
// now every slot resolves to a distinct Cartesia UUID.
//
// Female tones use female voices, male tones use male voices — the wizard
// UI can surface these grouped by gender when we build the preset picker.
const ROWS = [
  {
    slug: "voice_01_confident",
    displayName: "Voice 1",
    tone: "Confident",
    cartesia: CARTESIA.leo,
    genderHint: "male",
  },
  {
    slug: "voice_02_cheerful",
    displayName: "Voice 2",
    tone: "Cheerful",
    cartesia: CARTESIA.tessa,
    genderHint: "female",
  },
  {
    slug: "voice_03_dominant",
    displayName: "Voice 3",
    tone: "Dominant",
    cartesia: CARTESIA.kyle,
    genderHint: "male",
  },
  {
    slug: "voice_04_innocent",
    displayName: "Voice 4",
    tone: "Innocent",
    cartesia: CARTESIA.dana,
    genderHint: "female",
  },
  {
    slug: "voice_05_sweet",
    displayName: "Voice 5",
    tone: "Sweet",
    cartesia: CARTESIA.tessa,
    genderHint: "female",
  },
  {
    slug: "voice_06_sultry",
    displayName: "Voice 6",
    tone: "Sultry",
    cartesia: CARTESIA.maya,
    genderHint: "female",
  },
  {
    slug: "voice_07_calm",
    displayName: "Voice 7",
    tone: "Calm",
    cartesia: CARTESIA.jace,
    genderHint: "male",
  },
  {
    slug: "voice_08_thoughtful",
    displayName: "Voice 8",
    tone: "Thoughtful",
    cartesia: CARTESIA.marian,
    genderHint: "female",
  },
  {
    slug: "voice_09_whimsical",
    displayName: "Voice 9",
    tone: "Whimsical",
    cartesia: CARTESIA.gavin,
    genderHint: "male",
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === true;

  console.log("── seed-cartesia-voice-presets ──────────────────────────");
  console.log(`  dry-run: ${dryRun ? "YES" : "no"}`);
  console.log("");

  const url = readDirectUrl();
  const pool = new pg.Pool({ connectionString: url });

  try {
    for (const row of ROWS) {
      const before = await pool.query(
        `SELECT "provider", "providerVoiceId"
           FROM voice_presets
          WHERE "slug" = $1
          LIMIT 1`,
        [row.slug],
      );

      const existing = before.rows[0];
      console.log(
        `▸ ${row.slug.padEnd(24)} tone=${row.tone.padEnd(12)} → ${row.cartesia.id} (${row.cartesia.note})`,
      );
      if (existing) {
        const changing =
          existing.provider !== "CARTESIA" ||
          existing.providerVoiceId !== row.cartesia.id;
        console.log(
          `    existing provider=${existing.provider} voiceId=${existing.providerVoiceId} ${changing ? "→ WILL UPDATE" : "(no change)"}`,
        );
      } else {
        console.log(
          `    (no existing row — the seed migration should have created it; run prisma migrate first)`,
        );
        continue;
      }

      if (dryRun) continue;

      await pool.query(
        `UPDATE voice_presets
            SET "provider"        = 'CARTESIA',
                "providerVoiceId" = $1,
                "language"        = 'en',
                "isActive"        = TRUE,
                "updatedAt"       = NOW()
          WHERE "slug" = $2`,
        [row.cartesia.id, row.slug],
      );

      console.log("    ✓ updated");
    }

    console.log("");
    if (!dryRun) {
      console.log(
        "Done. New calls will pick voices from character.voicePresetId.",
      );
      console.log(
        "Existing characters keep their FK — they'll immediately sound different.",
      );
    }
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
