#!/usr/bin/env node
/**
 * scripts/seed-voice-model-configs.mjs
 *
 * Idempotently seeds the three voice-pipeline `model_configs` rows:
 *
 *   VOICE_STT → deepgram/nova-3
 *   VOICE_LLM → sao10k/l3.1-euryale-70b:nitro (with :nitro fallback chain)
 *   VOICE_TTS → cartesia/sonic-3.5
 *
 * Same rationale as switch-chat-model.mjs: model IDs and per-model params
 * are operational config, not schema. Bumping the STT endpointing knob
 * or swapping :nitro variants belongs in this script's git log, not in
 * _prisma_migrations. Runs safely on every deploy — upserts by `purpose`.
 *
 * Usage:
 *   node scripts/seed-voice-model-configs.mjs
 *   node scripts/seed-voice-model-configs.mjs --dry-run
 *
 * Env:
 *   Reads DIRECT_URL directly from .env — bypasses shell env injection.
 */

import fs from "node:fs";
import pg from "pg";

const ROWS = [
  {
    purpose: "VOICE_STT",
    provider: "DEEPGRAM",
    modelId: "nova-3",
    endpoint: "wss://api.deepgram.com/v1/listen",
    label: "Voice STT — Deepgram Nova-3",
    notes:
      "Streaming speech-to-text. `endpointing=200` is the single most " +
      "important knob for perceived turn snappiness — do not raise " +
      "without measuring end-to-end latency first.",
    parameters: {
      model: "nova-3",
      language: "multi",
      endpointing: 200,
      utterance_end_ms: 1000,
      interim_results: true,
      smart_format: true,
      numerals: true,
      punctuate: true,
      vad_events: true,
      encoding: "linear16",
      sample_rate: 16000,
    },
  },
  {
    purpose: "VOICE_LLM",
    provider: "OPENROUTER",
    modelId: "sao10k/l3.1-euryale-70b:nitro",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    label: "Voice LLM — Euryale 70B :nitro",
    notes:
      "Separate row from CHAT so we can point voice at :nitro routing " +
      "for latency without disturbing text-chat routing. Max tokens is " +
      "aggressively low (200) because voice fatigues the listener faster " +
      "than long text fatigues a reader — the composer's RESPONSE STYLE " +
      "block caps to 1-2 sentences anyway; this is a belt-and-braces cap.",
    parameters: {
      temperature: 0.85,
      top_p: 0.95,
      max_tokens: 200,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      models: [
        "sao10k/l3.1-euryale-70b:nitro",
        "sao10k/l3.3-euryale-70b:nitro",
        "sao10k/l3.1-euryale-70b",
      ],
    },
  },
  {
    purpose: "VOICE_TTS",
    provider: "CARTESIA",
    modelId: "sonic-3.5",
    endpoint: "wss://api.cartesia.ai/tts/websocket",
    label: "Voice TTS — Cartesia Sonic-3.5",
    notes:
      "Streaming TTS with inline [laugh]/[sigh]/[whisper]/[breath] " +
      "markers — the voice composer teaches the LLM to emit them. " +
      "Voice IDs are per-character and live on `voice_presets.providerVoiceId`.",
    parameters: {
      model_id: "sonic-3.5",
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: 16000,
      },
      language: "en",
      speed: "normal",
    },
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === true;

  console.log("── seed-voice-model-configs ─────────────────────────────");
  console.log(`  dry-run: ${dryRun ? "YES" : "no"}`);
  console.log("");

  const url = readDirectUrl();
  const pool = new pg.Pool({ connectionString: url });

  try {
    for (const row of ROWS) {
      const before = await pool.query(
        `SELECT "modelId", "isActive"
           FROM model_configs
          WHERE "purpose" = $1
          LIMIT 1`,
        [row.purpose],
      );

      const existing = before.rows[0];
      console.log(`▸ ${row.purpose} → ${row.modelId}`);
      if (existing) {
        console.log(
          `    existing modelId=${existing.modelId} isActive=${existing.isActive}`,
        );
      } else {
        console.log("    (no existing row — will insert)");
      }

      if (dryRun) continue;

      await pool.query(
        `INSERT INTO model_configs
           ("id", "purpose", "provider", "modelId", "endpoint",
            "parameters", "label", "notes", "isActive",
            "createdAt", "updatedAt")
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4,
            $5::jsonb, $6, $7, TRUE,
            NOW(), NOW())
         ON CONFLICT ("purpose")
         DO UPDATE SET
           "provider"   = EXCLUDED."provider",
           "modelId"    = EXCLUDED."modelId",
           "endpoint"   = EXCLUDED."endpoint",
           "parameters" = EXCLUDED."parameters",
           "label"      = EXCLUDED."label",
           "notes"      = EXCLUDED."notes",
           "isActive"   = TRUE,
           "updatedAt"  = NOW()`,
        [
          row.purpose,
          row.provider,
          row.modelId,
          row.endpoint,
          JSON.stringify(row.parameters),
          row.label,
          row.notes,
        ],
      );

      console.log(`    ✓ upserted`);
    }

    console.log("");
    console.log("Done. Note: ctx.models.resolve() caches for 60s.");
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
