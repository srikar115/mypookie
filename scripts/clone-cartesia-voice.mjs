#!/usr/bin/env node
/**
 * scripts/clone-cartesia-voice.mjs
 *
 * Clone a custom character voice from a sample audio file via
 * Cartesia's Clone Voice API, then (optionally) wire the resulting
 * voice ID into a `voice_presets` row so characters immediately pick
 * it up on their next call.
 *
 * Why cloning?
 *   Cartesia's stock Emotive-tier voices are decent but generic. To
 *   get a "sounds like a specific real person" voice — the Candy-AI
 *   feel — you clone from a short reference clip. Cartesia builds the
 *   voice from 3-10 seconds of source audio; pick a clip with the
 *   exact vibe you want (casual, warm, mid-sentence laughter beats
 *   are gold). Clean speech, minimal background noise.
 *
 * Usage:
 *   # Clone only — prints the new Cartesia voice ID:
 *   node scripts/clone-cartesia-voice.mjs --file ./samples/honey.wav --name "Honey"
 *
 *   # Clone + update an existing preset slot in-place:
 *   node scripts/clone-cartesia-voice.mjs --file ./samples/honey.wav --name "Honey" --preset voice_02_cheerful
 *
 *   # Clone + create a brand-new preset row (slug auto-derived):
 *   node scripts/clone-cartesia-voice.mjs --file ./samples/honey.wav --name "Honey" --new-preset --tone "Sweet"
 *
 *   # Non-English clip:
 *   node scripts/clone-cartesia-voice.mjs --file ./samples/mia.mp3 --name "Mia" --language es
 *
 * Supported clip formats: flac, mp3, mpeg, mpga, oga, ogg, wav, webm.
 *
 * Env loading:
 *   Reads CARTESIA_API_KEY and DIRECT_URL straight from .env — same
 *   rationale as switch-chat-model.mjs (shell env injection has been
 *   observed to corrupt vars in this environment).
 *
 * Cache note:
 *   The web app reads voice_presets per call-start (no long cache), so
 *   the new voice applies to the character's NEXT call. No dev-server
 *   restart needed.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const CARTESIA_VERSION = "2026-03-01";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const file = requireArg(args, "file");
  const name = requireArg(args, "name");
  const language = typeof args.language === "string" ? args.language : "en";
  const presetSlug = typeof args.preset === "string" ? args.preset : null;
  const createNew = args["new-preset"] === true;
  const tone = typeof args.tone === "string" ? args.tone : name;

  if (presetSlug && createNew) {
    fail("Use either --preset <slug> or --new-preset, not both.");
  }
  if (!fs.existsSync(file)) {
    fail(`Clip not found: ${file}`);
  }

  const apiKey = readEnvVar("CARTESIA_API_KEY");

  console.log("── clone-cartesia-voice ─────────────────────────────────");
  console.log(`  clip:     ${file}`);
  console.log(`  name:     ${name}`);
  console.log(`  language: ${language}`);
  console.log(
    `  target:   ${presetSlug ? `update preset '${presetSlug}'` : createNew ? "create new preset" : "clone only (no DB write)"}`,
  );
  console.log("");

  // ── Clone via Cartesia ────────────────────────────────────────────
  const clipBytes = fs.readFileSync(file);
  const form = new FormData();
  form.append(
    "clip",
    new Blob([clipBytes], { type: mimeFor(file) }),
    path.basename(file),
  );
  form.append("name", name);
  form.append("language", language);
  form.append(
    "description",
    `Amorify character voice cloned from ${path.basename(file)}`,
  );

  console.log("Uploading clip to Cartesia…");
  const res = await fetch("https://api.cartesia.ai/voices/clone", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    fail(`Cartesia clone failed (HTTP ${res.status}): ${body}`);
  }

  const voice = await res.json();
  if (!voice?.id) {
    fail(`Unexpected clone response: ${JSON.stringify(voice)}`);
  }

  console.log(`✓ cloned. Cartesia voice ID: ${voice.id}`);
  console.log("");

  if (!presetSlug && !createNew) {
    console.log("No --preset/--new-preset given — done. To wire it up:");
    console.log(
      `  node scripts/clone-cartesia-voice.mjs … --preset <slug>   (re-runs the clone)`,
    );
    console.log(
      `  or manually: UPDATE voice_presets SET "providerVoiceId"='${voice.id}', "provider"='CARTESIA' WHERE slug='<slug>';`,
    );
    return;
  }

  // ── Wire into voice_presets ───────────────────────────────────────
  const pool = new pg.Pool({ connectionString: readEnvVar("DIRECT_URL") });
  try {
    if (presetSlug) {
      const r = await pool.query(
        `UPDATE voice_presets
            SET "providerVoiceId" = $1,
                "provider" = 'CARTESIA',
                "displayName" = $2,
                "language" = $3,
                "updatedAt" = NOW()
          WHERE slug = $4
          RETURNING slug, "displayName", "providerVoiceId"`,
        [voice.id, name, language, presetSlug],
      );
      if (r.rows.length === 0) {
        fail(
          `No voice_presets row with slug='${presetSlug}'. Existing slugs:\n` +
            (await listSlugs(pool)),
        );
      }
      console.log("✓ preset updated:", r.rows[0]);
      console.log(
        "Characters assigned to this preset use the new voice on their next call.",
      );
    } else {
      const slug = slugify(`voice_custom_${name}`);
      const r = await pool.query(
        `INSERT INTO voice_presets
            (id, slug, "displayName", tone, provider, "providerVoiceId",
             language, "sortOrder", "isActive", "createdAt", "updatedAt")
         VALUES
            (gen_random_uuid(), $1, $2, $3, 'CARTESIA', $4, $5,
             (SELECT COALESCE(MAX("sortOrder"), 0) + 1 FROM voice_presets),
             true, NOW(), NOW())
         RETURNING id, slug, "providerVoiceId"`,
        [slug, name, tone, voice.id, language],
      );
      console.log("✓ new preset created:", r.rows[0]);
      console.log("");
      console.log("Assign it to a character with:");
      console.log(
        `  UPDATE characters SET "voicePresetId"='${r.rows[0].id}' WHERE id='<characterId>';`,
      );
    }
  } finally {
    await pool.end();
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

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

function requireArg(args, key) {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    fail(`Missing required --${key} <value>`);
  }
  return v;
}

function readEnvVar(key) {
  const raw = fs.readFileSync(".env", "utf8");
  const m = raw.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) fail(`${key} not found in .env`);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  const map = {
    ".flac": "audio/flac",
    ".mp3": "audio/mpeg",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

async function listSlugs(pool) {
  const r = await pool.query(
    `SELECT slug, "displayName", provider FROM voice_presets ORDER BY "sortOrder"`,
  );
  return r.rows
    .map((row) => `  - ${row.slug} (${row.displayName}, ${row.provider})`)
    .join("\n");
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
