#!/usr/bin/env node
/**
 * scripts/seed-voice-samples.mjs
 *
 * Enriches `voice_presets` so the wizard's voice picker becomes a real
 * listening experience instead of text-only tiles:
 *
 *   1. Fetches each preset's voice metadata from the Cartesia Voice
 *      Library (GET /voices/{id}) and replaces placeholder display
 *      names ("Voice 1", "Voice 2", …) with the real voice name,
 *      e.g. "Tessa — Cheerful".
 *   2. Synthesizes a short in-app-flavoured preview line with the
 *      actual voice via Cartesia TTS (POST /tts/bytes, mp3 output).
 *   3. Uploads the clip to R2 under voice-samples/{slug}.mp3.
 *   4. Sets `sampleR2Key` — the lookups repository already maps that
 *      to a public `sampleUrl`, and the wizard's VoicePicker renders a
 *      play button whenever sampleUrl is present. No app code changes
 *      needed after running this.
 *
 * Idempotent: presets that already have a sampleR2Key are skipped
 * unless --force is passed. Non-CARTESIA presets are always skipped.
 *
 * Usage:
 *   node scripts/seed-voice-samples.mjs [--dry-run] [--force]
 *
 * Env (from .env): CARTESIA_API_KEY, DIRECT_URL, R2_ENDPOINT,
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import "dotenv/config";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const CARTESIA_VERSION = "2026-03-01";
const TTS_MODEL = "sonic-3.5";

// One shared preview line, written for the companion vibe. The [laugh]
// marker synthesizes as a real chuckle on sonic-3.5, which demos the
// emotive range better than plain prose.
const SAMPLE_TRANSCRIPT =
  "Hey you… I was just thinking about you. [laugh] Come talk to me for a bit — how was your day?";

const PLACEHOLDER_NAME_RE = /^Voice \d+$/i;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const apiKey = requireEnv("CARTESIA_API_KEY");
  const pool = new pg.Pool({ connectionString: requireEnv("DIRECT_URL") });
  const r2 = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  const bucket = requireEnv("R2_BUCKET_NAME");

  console.log("── seed-voice-samples ───────────────────────────────────");
  console.log(`  dry-run: ${dryRun ? "YES" : "no"}   force: ${force ? "YES" : "no"}`);
  console.log("");

  try {
    const presets = await pool.query(
      `SELECT id, slug, "displayName", tone, "providerVoiceId", "sampleR2Key"
         FROM voice_presets
        WHERE "isActive" = true AND provider = 'CARTESIA'
        ORDER BY "sortOrder"`,
    );

    for (const p of presets.rows) {
      const hasSample = Boolean(p.sampleR2Key);
      const skip = hasSample && !force;
      console.log(
        `${p.slug}  voice=${p.providerVoiceId}  ${skip ? "→ skip (has sample)" : "→ process"}`,
      );
      if (skip) continue;
      if (dryRun) continue;

      // 1. Real name from the voice library.
      let realName = null;
      try {
        const meta = await cartesiaGet(
          `https://api.cartesia.ai/voices/${p.providerVoiceId}`,
          apiKey,
        );
        realName = typeof meta?.name === "string" ? meta.name.trim() : null;
      } catch (e) {
        console.warn(`   ! metadata fetch failed (${e.message}) — keeping current name`);
      }

      const displayName =
        realName && PLACEHOLDER_NAME_RE.test(p.displayName)
          ? `${realName} — ${p.tone}`
          : p.displayName;

      // 2. Synthesize the preview line.
      const audio = await cartesiaTtsBytes(apiKey, {
        model_id: TTS_MODEL,
        transcript: SAMPLE_TRANSCRIPT,
        voice: { mode: "id", id: p.providerVoiceId },
        language: "en",
        output_format: {
          container: "mp3",
          bit_rate: 128000,
          sample_rate: 44100,
        },
      });

      // 3. Upload to R2.
      const key = `voice-samples/${p.slug}.mp3`;
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: audio,
          ContentType: "audio/mpeg",
          // Samples are immutable per slug; long cache is safe because
          // --force re-uploads under the same key and R2 serves the
          // new bytes (cache busting is the CDN's concern, acceptable
          // for previews).
          CacheControl: "public, max-age=604800",
        }),
      );

      // 4. Persist.
      await pool.query(
        `UPDATE voice_presets
            SET "sampleR2Key" = $1, "displayName" = $2, "updatedAt" = NOW()
          WHERE id = $3`,
        [key, displayName, p.id],
      );
      console.log(
        `   ✓ ${displayName}  sample=${key} (${(audio.length / 1024).toFixed(0)} KB)`,
      );
    }

    console.log("");
    console.log("Done. Wizard voice tiles show a ▶ button on next page load.");
  } finally {
    await pool.end();
  }
}

// ─── Cartesia helpers ─────────────────────────────────────────────────

async function cartesiaGet(url, apiKey) {
  const res = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status}`);
  }
  return res.json();
}

async function cartesiaTtsBytes(apiKey, body) {
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "<unreadable>");
    throw new Error(`TTS bytes failed (HTTP ${res.status}): ${detail}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function requireEnv(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`✗ Missing env var: ${key}`);
    process.exit(1);
  }
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
