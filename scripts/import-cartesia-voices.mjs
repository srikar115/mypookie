#!/usr/bin/env node
/**
 * scripts/import-cartesia-voices.mjs
 *
 * Bulk-imports voices from the Cartesia Voice Library into
 * `voice_presets`, gender-tagged, so the character wizard can offer a
 * rich, filterable voice catalogue (>= 25 voices per gender) with
 * listenable previews.
 *
 * Per gender (feminine, masculine):
 *   1. GET /voices?gender=X&language=en&expand[]=preview_file_url —
 *      Cartesia's public library, which includes name ("Sophie"),
 *      tagline/profession ("Teacher"), description ("Mature female for
 *      natural conversations"), and a ready-made preview audio URL.
 *   2. Takes the first N (default 30) public voices not already in
 *      voice_presets (matched on providerVoiceId — so our curated
 *      presets like Ariana are never duplicated).
 *   3. Downloads Cartesia's own preview clip and re-hosts it on R2
 *      (zero TTS synthesis cost; R2 because Cartesia's CDN URLs are
 *      not guaranteed stable and we don't want wizard tiles hotlinking
 *      third-party storage).
 *   4. Upserts a voice_presets row: displayName "Sophie - Teacher",
 *      tone = full description, gender, sampleR2Key, sortOrder 100+
 *      (curated presets keep the top of the list).
 *
 * Also backfills `gender` on EXISTING presets by fetching each one's
 * metadata from Cartesia — required so the wizard's gender filter
 * doesn't hide the curated voices.
 *
 * Idempotent: re-running updates metadata in place and only downloads
 * previews for rows missing a sampleR2Key (use --force to re-download).
 *
 * Usage:
 *   node scripts/import-cartesia-voices.mjs [--per-gender 30] [--dry-run] [--force]
 */

import "dotenv/config";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const CARTESIA_VERSION = "2026-03-01";
const IMPORT_SORT_BASE = 100;

// ─── Description-based classifiers ────────────────────────────────────
// The public /voices API exposes neither age nor category/tags (the
// playground's Tags filter uses an internal API — verified 2026-08-03:
// `tags=`, `age=`, `category=` query params are silently ignored). The
// descriptions are consistently written though ("young adult female for
// conversational support", "Mature female for natural conversations"),
// so we mine them.

function classifyAgeGroup(text) {
  const t = text.toLowerCase();
  if (/\bmature\b|middle[- ]aged|\bolder\b|\bsenior\b|\belderly\b/.test(t)) {
    return "mature";
  }
  if (/\byoung adult\b|\byoung\b|\byouthful\b|\bteen(age)?\b|college/.test(t)) {
    return "young";
  }
  return null;
}

function classifyCategory(text) {
  const t = text.toLowerCase();
  // Support patterns FIRST — many support voices also say
  // "conversational" ("conversational support use cases"), and the
  // support signal is the one we care about burying.
  if (
    /customer (care|service|support)|support use|call center|reception|ivr|dispatcher|help ?desk|front ?line|professional assistance|corporate|coordinator|consultant|agent\b/.test(t)
  ) {
    return "support";
  }
  if (/narrat|storytell|audiobook|documentary|podcast/.test(t)) {
    return "narration";
  }
  if (/advertis|commercial|promo/.test(t)) {
    return "advertising";
  }
  if (
    /conversation|companion|friend|casual|chatting|warm|natural convers|empathetic|caring|intimate/.test(t)
  ) {
    return "conversational";
  }
  return null;
}

// Lower rank = earlier in the picker. Conversational voices are the
// companion-app sweet spot; support-desk voices are the "IVR accent"
// we keep steering away from, so they sink to the bottom.
const CATEGORY_RANK = {
  conversational: 0,
  null: 1,
  narration: 2,
  advertising: 3,
  support: 4,
};

function categoryRank(category) {
  return CATEGORY_RANK[category ?? "null"] ?? 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const perGender = args["per-gender"] ? Number.parseInt(args["per-gender"], 10) : 30;
  const dryRun = args["dry-run"] === true;
  const force = args.force === true;

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

  console.log("── import-cartesia-voices ───────────────────────────────");
  console.log(`  per-gender: ${perGender}   dry-run: ${dryRun ? "YES" : "no"}   force: ${force ? "YES" : "no"}`);
  console.log("");

  try {
    // ── 0. Backfill gender / ageGroup / category on existing presets ─
    const existing = await pool.query(
      `SELECT id, slug, "displayName", tone, "providerVoiceId", gender, "ageGroup", category
         FROM voice_presets
        WHERE provider = 'CARTESIA'`,
    );
    const knownVoiceIds = new Set(existing.rows.map((r) => r.providerVoiceId));

    for (const row of existing.rows) {
      const needsGender = !row.gender;
      const needsClass = !row.ageGroup || !row.category;
      if (!needsGender && !needsClass) continue;

      // `tone` holds the full description on imported rows; the curated
      // presets have a short tone word, so pull the real description
      // from the API for them.
      let gender = row.gender;
      let descText = `${row.displayName} ${row.tone}`;
      try {
        const meta = await cartesiaGet(
          `https://api.cartesia.ai/voices/${row.providerVoiceId}`,
          apiKey,
        );
        gender = gender ?? normalizeGender(meta?.gender);
        descText = `${meta?.name ?? row.displayName} ${meta?.description ?? row.tone}`;
      } catch (e) {
        console.warn(`backfill ${row.slug}: metadata fetch failed (${e.message}) — classifying from stored text`);
      }
      const ageGroup = row.ageGroup ?? classifyAgeGroup(descText);
      const category = row.category ?? classifyCategory(descText);

      console.log(
        `backfill ${row.slug} → gender=${gender ?? "?"} age=${ageGroup ?? "-"} category=${category ?? "-"}`,
      );
      if (!dryRun) {
        await pool.query(
          `UPDATE voice_presets
              SET gender = $1, "ageGroup" = $2, category = $3, "updatedAt" = NOW()
            WHERE id = $4`,
          [gender, ageGroup, category, row.id],
        );
      }
    }
    console.log("");

    // ── 0b. Re-rank previously imported rows by category ────────────
    // Rows imported before category classification existed carry
    // library-order sortOrder; push support voices down / pull
    // conversational up using the same banding as new imports.
    // Curated presets (non `cartesia_*` slugs) keep their hand-set
    // order at the top.
    if (!dryRun) {
      const imported = await pool.query(
        `SELECT id, gender, category FROM voice_presets
          WHERE slug LIKE 'cartesia\\_%' AND provider = 'CARTESIA'
          ORDER BY "sortOrder"`,
      );
      const counters = new Map();
      for (const row of imported.rows) {
        const band =
          IMPORT_SORT_BASE +
          (row.gender === "masculine" ? 1000 : 0) +
          categoryRank(row.category) * 100;
        const n = counters.get(band) ?? 0;
        counters.set(band, n + 1);
        await pool.query(
          `UPDATE voice_presets SET "sortOrder" = $1 WHERE id = $2`,
          [band + n, row.id],
        );
      }
      if (imported.rows.length > 0) {
        console.log(`re-ranked ${imported.rows.length} imported preset(s) by category`);
        console.log("");
      }
    }

    // ── 1-4. Import per gender ──────────────────────────────────────
    for (const gender of ["feminine", "masculine"]) {
      console.log(`─ ${gender} ─`);
      const voices = await listLibraryVoices(apiKey, gender, perGender, knownVoiceIds);
      console.log(`  ${voices.length} new library voice(s) to import`);

      let i = 0;
      for (const v of voices) {
        const slug = `cartesia_${v.id.slice(0, 8)}`;
        const displayName = buildDisplayName(v);
        const description = (v.description ?? "").trim() || displayName;
        const descText = `${displayName} ${description}`;
        const ageGroup = classifyAgeGroup(descText);
        const category = classifyCategory(descText);
        // Category drives the rank band; conversational voices lead,
        // support-desk voices sink. Within a band, library order.
        const sortOrder =
          IMPORT_SORT_BASE +
          (gender === "masculine" ? 1000 : 0) +
          categoryRank(category) * 100 +
          i;
        i++;

        console.log(
          `  + ${displayName}  age=${ageGroup ?? "-"} category=${category ?? "-"}`,
        );
        if (dryRun) continue;

        // Preview clip → R2. Skip download when the row already has a
        // sample and --force wasn't given.
        const prior = await pool.query(
          `SELECT "sampleR2Key" FROM voice_presets WHERE slug = $1`,
          [slug],
        );
        let sampleKey = prior.rows[0]?.sampleR2Key ?? null;
        if ((!sampleKey || force) && v.preview_file_url) {
          try {
            const clip = await fetch(v.preview_file_url);
            if (!clip.ok) throw new Error(`HTTP ${clip.status}`);
            const buffer = Buffer.from(await clip.arrayBuffer());
            sampleKey = `voice-samples/${slug}.mp3`;
            await r2.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: sampleKey,
                Body: buffer,
                ContentType: clip.headers.get("content-type") ?? "audio/mpeg",
                CacheControl: "public, max-age=604800",
              }),
            );
          } catch (e) {
            console.warn(`    ! preview download failed (${e.message}) — tile will have no play button until seed-voice-samples.mjs runs`);
          }
        }

        await pool.query(
          `INSERT INTO voice_presets
              (id, slug, "displayName", tone, provider, "providerVoiceId",
               "sampleR2Key", language, gender, "ageGroup", category,
               "sortOrder", "isActive", "createdAt", "updatedAt")
           VALUES
              (gen_random_uuid(), $1, $2, $3, 'CARTESIA', $4, $5, 'en', $6, $7, $8, $9, true, NOW(), NOW())
           ON CONFLICT (slug) DO UPDATE SET
              "displayName" = EXCLUDED."displayName",
              tone          = EXCLUDED.tone,
              "sampleR2Key" = COALESCE(EXCLUDED."sampleR2Key", voice_presets."sampleR2Key"),
              gender        = EXCLUDED.gender,
              "ageGroup"    = EXCLUDED."ageGroup",
              category      = EXCLUDED.category,
              "sortOrder"   = EXCLUDED."sortOrder",
              "isActive"    = true,
              "updatedAt"   = NOW()`,
          [
            slug,
            displayName,
            description,
            v.id,
            sampleKey,
            normalizeGender(v.gender) ?? gender,
            ageGroup,
            category,
            sortOrder,
          ],
        );
      }
      console.log("");
    }

    if (!dryRun) {
      const counts = await pool.query(
        `SELECT gender, category, "ageGroup", COUNT(*)::int AS n
           FROM voice_presets WHERE "isActive" = true
          GROUP BY gender, category, "ageGroup"
          ORDER BY gender, category, "ageGroup"`,
      );
      console.log("active presets by gender / category / age:");
      for (const r of counts.rows) {
        console.log(
          `  ${r.gender ?? "(null)"} / ${r.category ?? "-"} / ${r.ageGroup ?? "any"}: ${r.n}`,
        );
      }
    }
  } finally {
    await pool.end();
  }
}

// ─── Cartesia library listing ─────────────────────────────────────────

async function listLibraryVoices(apiKey, gender, wanted, knownVoiceIds) {
  const out = [];
  let cursor = null;
  // Page through the library until we have `wanted` unseen voices or
  // the library runs out. Cap at 5 pages as a runaway guard.
  for (let page = 0; page < 5 && out.length < wanted; page++) {
    const params = new URLSearchParams({
      limit: "100",
      gender,
      language: "en",
    });
    params.append("expand[]", "preview_file_url");
    if (cursor) params.set("starting_after", cursor);

    const body = await cartesiaGet(
      `https://api.cartesia.ai/voices?${params}`,
      apiKey,
    );
    const items = Array.isArray(body?.data) ? body.data : [];
    if (items.length === 0) break;
    cursor = items[items.length - 1]?.id ?? null;

    for (const v of items) {
      if (out.length >= wanted) break;
      if (!v?.id || knownVoiceIds.has(v.id)) continue;
      if (v.language && v.language !== "en") continue;
      out.push(v);
      knownVoiceIds.add(v.id);
    }
    if (!body?.has_more) break;
  }
  return out;
}

function buildDisplayName(v) {
  const name = (v.name ?? "").trim();
  const tagline = (v.tagline ?? "").trim();
  // Some catalogue entries already ship "Name - Tagline" as the name.
  if (tagline && !name.toLowerCase().includes(tagline.toLowerCase())) {
    return `${name} - ${tagline}`;
  }
  return name || v.id;
}

function normalizeGender(g) {
  if (g === "feminine" || g === "masculine" || g === "gender_neutral") return g;
  return null;
}

// ─── plumbing ─────────────────────────────────────────────────────────

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
