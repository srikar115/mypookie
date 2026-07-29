/**
 * scripts/seed-wizard-previews.mjs
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Wizard v2 preview image seeder                                          │
 * │                                                                          │
 * │ Standalone Node ESM script that enumerates every wizard-tile combo,    │
 * │ generates a preview image via fal.ai (using the same model row the    │
 * │ character wizard uses — IMAGE_TEXT_TO_IMAGE from `model_configs`),    │
 * │ uploads the result to Cloudflare R2, and inserts a row into           │
 * │ `wizard_option_previews`. Idempotent — reruns skip existing rows      │
 * │ unless `--force` is passed.                                            │
 * │                                                                          │
 * │ Runs OUTSIDE Next.js — pure pg + @fal-ai/client + AWS S3 SDK. Loads   │
 * │ config from .env via dotenv.                                          │
 * │                                                                          │
 * │ Usage:                                                                  │
 * │   node scripts/seed-wizard-previews.mjs [flags]                        │
 * │                                                                          │
 * │ Flags:                                                                  │
 * │   --matrix <core|full>       core = REALISTIC×FEMALE only (default),  │
 * │                              full = REALISTIC/ANIME × FEMALE/MALE     │
 * │   --only <T1,T2,...>         Restrict to these optionTypes            │
 * │   --dry-run                  Print combos, no fal / R2 / DB writes    │
 * │   --force                    Regenerate even if row exists            │
 * │   --limit <N>                Cap new generations this run              │
 * │   --concurrency <N>          Parallel workers (default: 3)             │
 * │                                                                          │
 * │ Cost estimate at fal Z-Image Turbo tier:                              │
 * │   core matrix (~55 combos):      ~$1.10, ~3 minutes                   │
 * │   full matrix (~220 combos):     ~$4.40, ~12 minutes                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fal } from "@fal-ai/client";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// ─── CLI arg parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    matrix: "core",
    only: null,
    dryRun: false,
    force: false,
    limit: Number.POSITIVE_INFINITY,
    concurrency: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matrix") args.matrix = argv[++i];
    else if (a === "--only") args.only = argv[++i].split(",").map((s) => s.trim().toUpperCase());
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--limit") args.limit = Number.parseInt(argv[++i], 10);
    else if (a === "--concurrency") args.concurrency = Number.parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: node scripts/seed-wizard-previews.mjs [flags]

Flags:
  --matrix <core|full>    Coverage matrix. Default: core (REALISTIC × FEMALE only)
  --only <T1,T2,...>      Restrict to these optionTypes (e.g., GENDER,ETHNICITY)
  --dry-run               Print combos without fal / R2 / DB writes
  --force                 Regenerate even if row exists
  --limit <N>             Cap new generations for this run
  --concurrency <N>       Parallel workers (default: 3)
`);
}

// ─── Static catalog ───────────────────────────────────────────────────────
// Static option types + values. BOND and PERSONALITY are dynamic (loaded
// from DB at runtime because their slugs come from admin-configurable
// lookup tables).

const STATIC_OPTIONS = {
  GENDER: ["FEMALE", "MALE", "TRANS_WOMAN", "TRANS_MAN", "NONBINARY"],
  LOOK: ["REALISTIC", "ANIME"],
  AGE_BUCKET: ["18-24", "25-30", "31-40", "41+"],
  ETHNICITY: [
    "EAST_ASIAN",
    "SOUTHEAST_ASIAN",
    "SOUTH_ASIAN",
    "MIDDLE_EASTERN",
    "NORTH_AFRICAN",
    "BLACK",
    "CARIBBEAN",
    "LATINA",
    "EUROPEAN",
    "MIXED",
  ],
  HAIR_COLOR: [
    "BLACK",
    "BROWN",
    "BLONDE",
    "AUBURN",
    "RED",
    "SILVER",
    "PINK",
  ],
  HAIR_STYLE: [
    "STRAIGHT",
    "WAVY",
    "BOB",
    "PIXIE",
    "CURLY",
    "BRAIDS",
    "PONYTAIL",
  ],
  EYE_COLOR: ["BROWN", "HAZEL", "GREEN", "BLUE", "GRAY", "VIOLET"],
  BODY_TYPE: [
    "SLIM",
    "ATHLETIC",
    "CURVY",
    "PETITE",
    "VOLUPTUOUS",
    "PLUS_SIZE",
  ],
  FASHION: [
    "CASUAL_CHIC",
    "ELEGANT",
    "STREETWEAR",
    "BOHEMIAN",
    "GOTH",
    "ANIME_FASHION",
    "SPORTY",
  ],
};

const MATRIX_CORE = [{ baseStyle: "REALISTIC", gender: "FEMALE" }];
const MATRIX_FULL = [
  { baseStyle: "REALISTIC", gender: "FEMALE" },
  { baseStyle: "REALISTIC", gender: "MALE" },
  { baseStyle: "ANIME", gender: "FEMALE" },
  { baseStyle: "ANIME", gender: "MALE" },
];

// ─── Prompt builder ───────────────────────────────────────────────────────

const GENDER_NOUN = {
  FEMALE: "young woman",
  MALE: "young man",
  TRANS_WOMAN: "young transgender woman",
  TRANS_MAN: "young transgender man",
  NONBINARY: "young androgynous person",
};

function styleLead(baseStyle) {
  return baseStyle === "ANIME"
    ? "anime illustration, cel-shaded, vibrant colors, professional anime portrait art, tasteful character design"
    : "photorealistic portrait, fashion editorial photography, natural lighting, detailed skin texture, sharp focus, high quality, 4k";
}

const ETHNICITY_LABEL = {
  EAST_ASIAN: "east asian",
  SOUTHEAST_ASIAN: "southeast asian",
  SOUTH_ASIAN: "south asian",
  MIDDLE_EASTERN: "middle eastern",
  NORTH_AFRICAN: "north african",
  BLACK: "black",
  CARIBBEAN: "afro-caribbean",
  LATINA: "latina",
  EUROPEAN: "european",
  MIXED: "mixed-heritage",
};

const BUCKET_AGES = {
  "18-24": 22,
  "25-30": 27,
  "31-40": 34,
  "41+": 45,
};

const HAIR_STYLE_DESC = {
  STRAIGHT: "long straight sleek hair",
  WAVY: "long wavy flowing hair",
  BOB: "chin-length bob haircut",
  PIXIE: "short pixie cut",
  CURLY: "voluminous curly hair",
  BRAIDS: "elegant braided hairstyle",
  PONYTAIL: "high ponytail hairstyle",
};

const BODY_DESC = {
  SLIM: "slim slender figure",
  ATHLETIC: "athletic toned figure",
  CURVY: "curvy hourglass figure",
  PETITE: "petite small frame",
  VOLUPTUOUS: "voluptuous figure",
  PLUS_SIZE: "plus-size body-positive figure",
};

const FASHION_DESC = {
  CASUAL_CHIC: {
    FEMALE: "wearing a cream silk blouse tucked into a pleated midi skirt with block heels",
    MALE: "wearing a crisp white oxford shirt rolled at the sleeves over slim navy chinos",
  },
  ELEGANT: {
    FEMALE: "wearing an emerald satin slip dress with delicate gold jewelry",
    MALE: "wearing a charcoal three-piece suit with a silk pocket square",
  },
  STREETWEAR: {
    FEMALE: "wearing an oversized graphic hoodie, biker shorts, and chunky white sneakers",
    MALE: "wearing an oversized bomber jacket, graphic hoodie, and cargo pants with chunky sneakers",
  },
  BOHEMIAN: {
    FEMALE: "wearing a flowing bohemian maxi dress with floral print and layered turquoise necklaces",
    MALE: "wearing a loose linen button-up half-tucked into flowing tan trousers with a suede vest",
  },
  GOTH: {
    FEMALE: "wearing a black lace corset dress with fishnet tights and platform boots",
    MALE: "wearing a black leather biker jacket, band tee, ripped black jeans, and combat boots",
  },
  ANIME_FASHION: {
    FEMALE: "wearing a preppy sailor-style blouse with a red ribbon tie and pleated plaid skirt",
    MALE: "wearing a modern school-style blazer, white shirt, and dark trousers",
  },
  SPORTY: {
    FEMALE: "wearing a matching athletic set with a sports bra and high-waisted leggings",
    MALE: "wearing a fitted athletic tank and gym shorts with running shoes",
  },
};

const BOND_HINT = {
  romantic: "warm affectionate romantic gaze",
  playful: "playful cheerful smile, sun-kissed casual portrait",
  fantasy: "dreamy magical fantasy atmosphere, cinematic lighting",
  friend: "warm friendly relaxed portrait, natural cafe setting",
};

const PERSONALITY_HINT = {
  playful: "playful cheerful expression",
  shy: "soft shy demure expression",
  bold: "confident bold expression",
  caring: "warm gentle caring expression",
  intellectual: "thoughtful intellectual expression, reading a book",
  seductive: "confident alluring expression",
  wholesome: "sweet wholesome smile",
  mysterious: "mysterious enigmatic expression, low key lighting",
};

function pickPoolValue(map, key, fallback) {
  const k = String(key).toLowerCase();
  for (const [pattern, value] of Object.entries(map)) {
    if (k.includes(pattern)) return value;
  }
  return fallback;
}

function bodyResolveGender(gender) {
  return gender === "TRANS_WOMAN" || gender === "NONBINARY" ? "FEMALE" : gender === "TRANS_MAN" ? "MALE" : gender;
}

function buildPrompt({ optionType, optionValue, baseStyle, gender }) {
  const lead = styleLead(baseStyle);
  const noun = GENDER_NOUN[gender] ?? "young person";
  const canonicalGender = bodyResolveGender(gender);
  const wardrobeGender = canonicalGender === "MALE" ? "MALE" : "FEMALE";

  switch (optionType) {
    case "GENDER":
      // optionValue itself is the gender — override `gender` axis so the
      // prompt showcases that specific presentation.
      return `${lead}, portrait of a ${GENDER_NOUN[optionValue]}, warm friendly expression, neutral cream background, professional headshot, editorial magazine style`;

    case "LOOK":
      // optionValue is the baseStyle. Showcase that style with a
      // representative portrait.
      return optionValue === "REALISTIC"
        ? `${styleLead("REALISTIC")}, portrait of a ${noun} with dark wavy hair, warm brown eyes, cream neutral background, cinematic editorial lighting`
        : `${styleLead("ANIME")}, portrait of a ${noun} with long dark hair, expressive eyes, dusk sky background, professional anime illustration`;

    case "BOND": {
      const hint = pickPoolValue(BOND_HINT, optionValue, "warm friendly portrait, natural expression");
      return `${lead}, portrait of a ${noun}, ${hint}, neutral studio backdrop, editorial magazine style`;
    }

    case "PERSONALITY": {
      const hint = pickPoolValue(PERSONALITY_HINT, optionValue, "natural relaxed expression");
      return `${lead}, portrait of a ${noun}, ${hint}, cream neutral background, editorial magazine style`;
    }

    case "AGE_BUCKET": {
      const yrs = BUCKET_AGES[optionValue] ?? 25;
      return `${lead}, portrait of a ${noun}, approximately ${yrs} years old, natural expression, cream neutral background, editorial magazine style`;
    }

    case "ETHNICITY": {
      const eth = ETHNICITY_LABEL[optionValue] ?? "mixed heritage";
      return `${lead}, close-up beauty portrait of a ${eth} ${noun}, natural expression, warm soft lighting, cream neutral background, magazine cover style`;
    }

    case "HAIR_COLOR": {
      const color = String(optionValue).toLowerCase();
      // Candy uses close-up macro shots of just hair for this tile. Keep
      // it art-direction-clean and abstract so the color reads at a glance.
      return baseStyle === "ANIME"
        ? `anime illustration, extreme close-up of vibrant ${color} anime-style hair strands, cel-shaded, dynamic flowing composition, minimalist pastel background`
        : `photorealistic extreme close-up macro photograph of glossy ${color} silky hair strands flowing in soft golden light, high detail, editorial beauty photography, cream neutral background`;
    }

    case "HAIR_STYLE": {
      const desc = HAIR_STYLE_DESC[optionValue] ?? String(optionValue).toLowerCase();
      // Silhouette-style back or side view emphasising the cut shape.
      return `${lead}, elegant back or side view portrait of a ${noun} with a ${desc}, soft warm lighting, cream neutral background, editorial beauty photography`;
    }

    case "EYE_COLOR": {
      const color = String(optionValue).toLowerCase();
      return baseStyle === "ANIME"
        ? `anime illustration, extreme close-up of a large expressive ${color} anime-style eye, detailed iris highlights, cel-shaded, vibrant colors`
        : `photorealistic extreme close-up macro photograph of a ${color} eye, high detail iris texture, long natural eyelashes, editorial beauty photography, sharp focus`;
    }

    case "BODY_TYPE": {
      const desc = BODY_DESC[optionValue] ?? String(optionValue).toLowerCase();
      return `${lead}, full-body fashion portrait of a ${noun} with a ${desc}, casual outfit, cream neutral background, natural pose, editorial magazine style, fully clothed`;
    }

    case "FASHION": {
      const wardrobe =
        FASHION_DESC[optionValue]?.[wardrobeGender] ??
        `wearing a ${String(optionValue).toLowerCase().replace(/_/g, " ")} outfit`;
      return `${lead}, full-body fashion portrait of a ${noun} ${wardrobe}, natural pose, cream neutral background, editorial magazine style, fully clothed`;
    }

    default:
      throw new Error(`No prompt template for optionType=${optionType}`);
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────

async function getDbPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env from the repo root.");
  }
  // Pool handles the concurrent worker inserts safely; a single pg.Client
  // would emit the "client is already executing a query" deprecation
  // warning under Promise.all traffic.
  const pool = new pg.Pool({ connectionString, max: 6 });
  return pool;
}

async function fetchBondCatalog(db) {
  const q = await db.query(
    `SELECT slug FROM "relationship_archetypes" WHERE "isActive" = TRUE ORDER BY "sortOrder" ASC, slug ASC`,
  );
  return q.rows.map((r) => r.slug);
}

async function fetchPersonalityCatalog(db) {
  const q = await db.query(
    `SELECT slug FROM "personality_archetypes" WHERE "isActive" = TRUE ORDER BY "sortOrder" ASC, slug ASC`,
  );
  return q.rows.map((r) => r.slug);
}

async function fetchTextToImageModelId(db) {
  const q = await db.query(
    `SELECT "modelId", parameters FROM "model_configs" WHERE purpose = 'IMAGE_TEXT_TO_IMAGE' AND "isActive" = TRUE ORDER BY "updatedAt" DESC LIMIT 1`,
  );
  if (q.rows.length === 0) {
    throw new Error(
      "No active IMAGE_TEXT_TO_IMAGE model in `model_configs`. Seed it before running the preview seeder.",
    );
  }
  return { modelId: q.rows[0].modelId, parameters: q.rows[0].parameters ?? {} };
}

async function existingKeys(db) {
  const q = await db.query(
    `SELECT "optionType", "optionValue", "baseStyle", "gender" FROM "wizard_option_previews"`,
  );
  return new Set(q.rows.map((r) => `${r.optionType}::${r.optionValue}::${r.baseStyle}::${r.gender}`));
}

async function insertPreviewRow(db, row) {
  await db.query(
    `INSERT INTO "wizard_option_previews"
     ("id", "optionType", "optionValue", "baseStyle", "gender", "imageR2Key", "imageUrl", "promptSnapshot")
     VALUES ($1, $2::"WizardOptionType", $3, $4::"BaseStyle", $5::"Gender", $6, $7, $8)
     ON CONFLICT ("optionType", "optionValue", "baseStyle", "gender")
     DO UPDATE SET "imageR2Key" = EXCLUDED."imageR2Key", "imageUrl" = EXCLUDED."imageUrl",
                   "promptSnapshot" = EXCLUDED."promptSnapshot", "generatedAt" = NOW()`,
    [
      row.id,
      row.optionType,
      row.optionValue,
      row.baseStyle,
      row.gender,
      row.imageR2Key,
      row.imageUrl,
      row.promptSnapshot,
    ],
  );
}

// ─── R2 upload ─────────────────────────────────────────────────────────────

function buildR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadFromUrl(client, remoteUrl, key, contentType) {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`Fetch fal image failed: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// ─── Fal generation ────────────────────────────────────────────────────────

function ensureFalConfigured() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY is not set in .env");
  fal.config({ credentials: key });
}

async function generateFalImage({ modelId, parameters, prompt }) {
  // Merge parameters same as `FalImageGenerator` — DB knobs win, then
  // sensible defaults kick in for anything missing. Uses `portrait_4_3`
  // by default which matches Candy's tile aspect ratio.
  const input = {
    prompt,
    image_size: parameters.image_size ?? "portrait_4_3",
    num_inference_steps: parameters.num_inference_steps ?? 8,
    output_format: parameters.output_format ?? "webp",
    enable_safety_checker: parameters.enable_safety_checker ?? false,
    num_images: 1,
    acceleration: parameters.acceleration ?? "regular",
    seed: Math.floor(Math.random() * 2_000_000_000),
  };

  const result = await fal.subscribe(modelId, { input, logs: false });
  const data = result?.data ?? result;
  const first = data?.images?.[0];
  if (!first?.url) {
    throw new Error(`fal ${modelId} returned unexpected shape`);
  }
  return { url: first.url, contentType: first.content_type ?? "image/webp" };
}

// ─── Combo enumeration ────────────────────────────────────────────────────

function enumerateCombos({ matrix, staticOptions, dynamicOptions, only }) {
  const combos = [];
  const rawTypes = { ...staticOptions, ...dynamicOptions };
  const types = only ? Object.keys(rawTypes).filter((t) => only.includes(t)) : Object.keys(rawTypes);

  for (const optionType of types) {
    const values = rawTypes[optionType];
    if (!values || values.length === 0) continue;

    if (optionType === "GENDER") {
      // Special case: gender IS the value. Iterate baseStyles only.
      for (const value of values) {
        for (const m of matrix) {
          combos.push({
            optionType,
            optionValue: value,
            baseStyle: m.baseStyle,
            gender: value, // <- overridden
          });
        }
      }
      continue;
    }

    if (optionType === "LOOK") {
      // Special case: baseStyle IS the value. Iterate genders only.
      for (const value of values) {
        for (const m of matrix) {
          combos.push({
            optionType,
            optionValue: value,
            baseStyle: value, // <- overridden
            gender: m.gender,
          });
        }
      }
      continue;
    }

    // Standard iteration: cross-product with the matrix.
    for (const value of values) {
      for (const m of matrix) {
        combos.push({
          optionType,
          optionValue: value,
          baseStyle: m.baseStyle,
          gender: m.gender,
        });
      }
    }
  }
  return combos;
}

// ─── Concurrency limiter ──────────────────────────────────────────────────

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  let done = 0;
  const total = items.length;
  const results = [];

  async function loop(workerIx) {
    while (true) {
      const i = cursor++;
      if (i >= total) break;
      try {
        const r = await worker(items[i], i);
        results.push({ ok: true, item: items[i], value: r });
      } catch (e) {
        results.push({ ok: false, item: items[i], error: e });
      }
      done++;
      process.stdout.write(
        `\r[seed] progress: ${done}/${total}  worker=${workerIx}      `,
      );
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, (_, ix) => loop(ix));
  await Promise.all(workers);
  process.stdout.write("\n");
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[seed] flags:", args);

  const matrix = args.matrix === "full" ? MATRIX_FULL : MATRIX_CORE;
  console.log(
    `[seed] matrix: ${matrix.map((m) => `${m.baseStyle}×${m.gender}`).join(", ")}`,
  );

  const db = await getDbPool();
  try {
    const [bondSlugs, personalitySlugs, modelCfg, existing] = await Promise.all([
      fetchBondCatalog(db),
      fetchPersonalityCatalog(db),
      fetchTextToImageModelId(db),
      existingKeys(db),
    ]);
    console.log(
      `[seed] catalogs: bond=${bondSlugs.length}, personality=${personalitySlugs.length}`,
    );
    console.log(`[seed] model: ${modelCfg.modelId}`);
    console.log(`[seed] existing preview rows: ${existing.size}`);

    const dynamicOptions = {
      BOND: bondSlugs,
      PERSONALITY: personalitySlugs,
    };

    const allCombos = enumerateCombos({
      matrix,
      staticOptions: STATIC_OPTIONS,
      dynamicOptions,
      only: args.only,
    });

    const combos = args.force
      ? allCombos
      : allCombos.filter(
          (c) =>
            !existing.has(
              `${c.optionType}::${c.optionValue}::${c.baseStyle}::${c.gender}`,
            ),
        );

    console.log(
      `[seed] combos: total=${allCombos.length}, new=${combos.length}, skipping=${allCombos.length - combos.length}`,
    );

    const workset = combos.slice(0, args.limit);
    if (workset.length < combos.length) {
      console.log(
        `[seed] --limit ${args.limit}: taking first ${workset.length} of ${combos.length} pending`,
      );
    }

    if (args.dryRun) {
      console.log("[seed] --dry-run, printing sample prompts:");
      for (const c of workset.slice(0, 12)) {
        const p = buildPrompt(c);
        console.log(
          `  ${c.optionType} × ${c.optionValue} × ${c.baseStyle} × ${c.gender}`,
        );
        console.log(`    → ${p.slice(0, 200)}${p.length > 200 ? "..." : ""}`);
      }
      console.log(`[seed] (skipped ${Math.max(0, workset.length - 12)} more)`);
      return;
    }

    if (workset.length === 0) {
      console.log("[seed] nothing to do — every combo is already seeded.");
      return;
    }

    ensureFalConfigured();
    const r2 = buildR2Client();

    const results = await runWithConcurrency(workset, args.concurrency, async (c) => {
      const prompt = buildPrompt(c);
      const fal = await generateFalImage({
        modelId: modelCfg.modelId,
        parameters: modelCfg.parameters,
        prompt,
      });
      const key = `wizard-previews/${c.optionType.toLowerCase()}/${c.optionValue.toLowerCase()}-${c.baseStyle.toLowerCase()}-${c.gender.toLowerCase()}.webp`;
      const url = await uploadFromUrl(r2, fal.url, key, fal.contentType);
      const row = {
        id: randomUUID(),
        optionType: c.optionType,
        optionValue: c.optionValue,
        baseStyle: c.baseStyle,
        gender: c.gender,
        imageR2Key: key,
        imageUrl: url,
        promptSnapshot: prompt,
      };
      await insertPreviewRow(db, row);
      return row;
    });

    const failures = results.filter((r) => !r.ok);
    const successes = results.filter((r) => r.ok);
    console.log(
      `[seed] done: ${successes.length} ok, ${failures.length} failed`,
    );
    if (failures.length > 0) {
      console.log("[seed] failures:");
      for (const f of failures.slice(0, 15)) {
        const c = f.item;
        console.log(
          `  ${c.optionType}×${c.optionValue}×${c.baseStyle}×${c.gender}: ${f.error?.message ?? f.error}`,
        );
      }
    }
  } finally {
    await db.end();
  }
}

// (pg.Pool exposes `.end()` too, so the finally block above works for
// both Client and Pool shapes.)

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
