import "server-only";
import { z } from "zod";

/**
 * The single source of truth for every environment variable this application
 * consumes. Read once, validated once, exported as a typed object.
 *
 *   ✔ `process.env.X` is banned everywhere else — always import `env` from
 *     `@/config/env` and let TypeScript keep you honest.
 *   ✔ Missing / malformed values fail loudly at boot instead of surfacing as
 *     mysterious 500s at request time.
 *   ✔ This file is server-only: the `import "server-only"` above will trigger
 *     a build error if a Client Component tries to import it.
 *
 * Add new variables here first, then use them. Do not scatter `process.env`
 * lookups back through the codebase.
 */

const optionalString = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const requiredString = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(1, `${name} must not be empty`);

const requiredUrl = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .url(`${name} must be a valid URL`);

const boolFromEnv = z
  .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => v === "1" || v === "true");

const envSchema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database — Supabase (Postgres) via poolers
  DATABASE_URL: requiredUrl("DATABASE_URL"),
  DIRECT_URL: requiredUrl("DIRECT_URL"),

  // NextAuth v5. AUTH_URL / AUTH_SECRET / AUTH_TRUST_HOST are the canonical
  // v5 names read by next-auth itself; NEXTAUTH_* are kept for backwards
  // compat with legacy code paths but v5 silently ignores NEXTAUTH_URL.
  //
  // AUTH_TRUST_HOST=true is REQUIRED in prod (`next start`) — without it,
  // v5 refuses every request with an UntrustedHost error whenever AUTH_URL
  // doesn't exactly match the incoming Host header (breaks ngrok, LAN IPs,
  // and every reverse-proxied deploy).
  AUTH_SECRET: optionalString,
  AUTH_URL: optionalString,
  AUTH_TRUST_HOST: boolFromEnv,
  NEXTAUTH_SECRET: requiredString("NEXTAUTH_SECRET"),
  NEXTAUTH_URL: optionalString,

  // Redis (rate limiting, job queue, hot memory cache)
  REDIS_URL: requiredUrl("REDIS_URL"),

  // Storage (Cloudflare R2)
  STORAGE_PROVIDER: z.enum(["r2", "local", "passthrough"]).default("passthrough"),
  R2_ENDPOINT: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_PUBLIC_URL: optionalString,

  // AI providers (all optional — enable per-feature)
  OPENAI_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  STABILITY_API_KEY: optionalString,
  RUNWAY_API_KEY: optionalString,
  KLING_API_KEY: optionalString,
  FAL_API_KEY: optionalString,

  // OpenRouter is required for live chat + memory extraction.
  // NOTE: model IDs live in the `model_configs` table — they are intentionally
  // NOT env vars so admins can swap them at runtime without a redeploy.
  OPENROUTER_API_KEY: z
    .string({ error: "OPENROUTER_API_KEY is required" })
    .min(20, "OPENROUTER_API_KEY must not be empty"),

  // Chat behavior — deploy-time defaults; can be lifted into DB later.
  CHAT_MAX_HISTORY_TURNS: z
    .string()
    .default("20")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  CHAT_MAX_TOKENS: z
    .string()
    .default("512")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  CHAT_TEMPERATURE: z
    .string()
    .default("0.9")
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().min(0).max(2)),
  CHAT_SESSION_SUMMARY_EVERY_N_TURNS: z
    .string()
    .default("20")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),

  // Memory behavior
  MEMORY_ENABLED: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "1" || v === "true"),
  MEMORY_TOP_K: z
    .string()
    .default("5")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),

  // Semantic (vector) memory — toggle + retrieval score weights. Toggle
  // defaults to true; embedder is skipped automatically if OPENAI_API_KEY
  // is missing so this is safe. Weights tune the four retrieval signals
  // (lexical ts_rank_cd, entity overlap, recency decay, cosine similarity).
  SEMANTIC_MEMORY_ENABLED: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "1" || v === "true"),
  HYBRID_LEXICAL_WEIGHT: z
    .string()
    .default("2.0")
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().nonnegative()),
  HYBRID_ENTITY_WEIGHT: z
    .string()
    .default("1.5")
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().nonnegative()),
  HYBRID_RECENCY_WEIGHT: z
    .string()
    .default("1.0")
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().nonnegative()),
  HYBRID_SEMANTIC_WEIGHT: z
    .string()
    .default("1.5")
    .transform((v) => Number.parseFloat(v))
    .pipe(z.number().nonnegative()),

  // Voice calls — LiveKit transport + Deepgram STT + Cartesia TTS.
  // All optional at the schema level; enforced together via
  // assertVoiceConfigIfEnabled() when VOICE_CALLS_ENABLED is true.
  VOICE_CALLS_ENABLED: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "1" || v === "true"),
  LIVEKIT_URL: optionalString,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
  // Must match the `AGENT_NAME` constant in
  // E:\mypookie-livekit\src\index.ts. When set (recommended), the web
  // app uses explicit dispatch to route the job to a specific worker;
  // ghost worker registrations are ignored. Empty falls back to
  // fragile auto-dispatch — kept optional so existing dev setups keep
  // booting until they refresh their .env.
  LIVEKIT_AGENT_NAME: z
    .string()
    .default("amorify-companion")
    .transform((v) => v.trim()),
  LIVEKIT_AGENT_URL: optionalString,
  LIVEKIT_WEBHOOK_KEY: optionalString,
  DEEPGRAM_API_KEY: optionalString,
  CARTESIA_API_KEY: optionalString,
  // Cartesia voice IDs picked per character gender. Cartesia splits
  // their catalogue into "Stable" voices (best for support-desk
  // agents) and "Emotive" voices (best for AI characters, companion
  // apps, and game NPCs). Companion voices belong in the Emotive tier
  // — Stable voices sound flat and IVR-ish.
  //
  //   Female: Ariana — Kind Friend — ec1e269e-9ca0-402f-8a18-58e0e022355a
  //     "Friendly and approachable female voice with a warm, welcoming
  //      tone that builds instant connection." Product default since
  //      2026-08-03 (see scripts/seed-default-voice-ariana.mjs).
  //     Alternatives: Tessa (6ccbfb76-…), Lucy.
  //   Male:   Kyle  — c961b81c-a935-4c17-bfb3-ba2239de8c2f
  //     Grounded, playful. Alternatives: Cory, Nolan.
  //
  // These are FALLBACK picks only — per-character voices live in
  // `voice_presets` and win when present.
  CARTESIA_VOICE_ID_FEMALE: z
    .string()
    .default("ec1e269e-9ca0-402f-8a18-58e0e022355a"),
  CARTESIA_VOICE_ID_MALE: z
    .string()
    .default("c961b81c-a935-4c17-bfb3-ba2239de8c2f"),
  CARTESIA_VOICE_ID_NONBINARY: optionalString,
  VOICE_CREDITS_PER_MINUTE: z
    .string()
    .default("5")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  VOICE_MAX_DAILY_MINUTES: z
    .string()
    .default("60")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  NEXT_PUBLIC_VOICE_CALLS_ENABLED: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "1" || v === "true"),

  // In-chat media generation (images and video via fal.ai).
  // CHAT_MEDIA_ENABLED controls the server-side pipeline (generation, routes).
  // NEXT_PUBLIC_CHAT_MEDIA_ENABLED controls whether the client shows the UI.
  // NEXT_PUBLIC_CHAT_VIDEO_ENABLED is a sub-flag — off until the video path
  // is fully tested; image generation can be live while video is not.
  CHAT_MEDIA_ENABLED: boolFromEnv,
  NEXT_PUBLIC_CHAT_MEDIA_ENABLED: boolFromEnv,
  NEXT_PUBLIC_CHAT_VIDEO_ENABLED: boolFromEnv,

  // Stripe (billing)
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  // Credits
  NEW_USER_TRIAL_CREDITS: z
    .string()
    .default("100")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().nonnegative()),

  // Startup preflight controls
  STARTUP_SKIP_PREFLIGHT: boolFromEnv,
  STARTUP_REQUIRE_REDIS: z
    .union([z.literal("1"), z.literal("0")])
    .optional(),

  // Public app metadata
  NEXT_PUBLIC_APP_URL: requiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_APP_NAME: requiredString("NEXT_PUBLIC_APP_NAME"),

  // Next.js internals we occasionally need to branch on
  NEXT_RUNTIME: optionalString,
  NEXT_PHASE: optionalString,
});

/**
 * When STORAGE_PROVIDER is 'r2', every R2_* variable becomes mandatory. We
 * enforce this after parsing so the base error messages remain readable.
 */
function assertR2ConfigIfEnabled(parsed: z.infer<typeof envSchema>): void {
  if (parsed.STORAGE_PROVIDER !== "r2") return;
  const missing: string[] = [];
  if (!parsed.R2_ENDPOINT) missing.push("R2_ENDPOINT");
  if (!parsed.R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");
  if (!parsed.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!parsed.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!parsed.R2_PUBLIC_URL) missing.push("R2_PUBLIC_URL");
  if (missing.length) {
    throw new Error(
      `[config/env] STORAGE_PROVIDER=r2 but missing: ${missing.join(", ")}`,
    );
  }
}

/**
 * When VOICE_CALLS_ENABLED is true, LiveKit + Deepgram + Cartesia keys and the
 * agent worker URL must all be present. The webhook shared-secret is required
 * too — it signs agent → web callbacks so the turn persistence endpoint cannot
 * be forged from the public internet.
 */
function assertVoiceConfigIfEnabled(parsed: z.infer<typeof envSchema>): void {
  if (!parsed.VOICE_CALLS_ENABLED) return;
  const missing: string[] = [];
  if (!parsed.LIVEKIT_URL) missing.push("LIVEKIT_URL");
  if (!parsed.LIVEKIT_API_KEY) missing.push("LIVEKIT_API_KEY");
  if (!parsed.LIVEKIT_API_SECRET) missing.push("LIVEKIT_API_SECRET");
  if (!parsed.LIVEKIT_AGENT_URL) missing.push("LIVEKIT_AGENT_URL");
  if (!parsed.LIVEKIT_WEBHOOK_KEY) missing.push("LIVEKIT_WEBHOOK_KEY");
  if (!parsed.DEEPGRAM_API_KEY) missing.push("DEEPGRAM_API_KEY");
  if (!parsed.CARTESIA_API_KEY) missing.push("CARTESIA_API_KEY");
  if (missing.length) {
    throw new Error(
      `[config/env] VOICE_CALLS_ENABLED=true but missing: ${missing.join(", ")}`,
    );
  }
}

/**
 * When CHAT_MEDIA_ENABLED is true, FAL_API_KEY must be present.
 */
function assertMediaConfigIfEnabled(parsed: z.infer<typeof envSchema>): void {
  if (!parsed.CHAT_MEDIA_ENABLED) return;
  if (!parsed.FAL_API_KEY) {
    throw new Error(
      `[config/env] CHAT_MEDIA_ENABLED=true but missing: FAL_API_KEY`,
    );
  }
}

function parseEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  · ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[config/env] Environment validation failed:\n${details}\n\n` +
        `Fix the above and restart. See .env for the full list of required vars.`,
    );
  }
  assertR2ConfigIfEnabled(parsed.data);
  assertVoiceConfigIfEnabled(parsed.data);
  assertMediaConfigIfEnabled(parsed.data);
  return parsed.data;
}

export const env = parseEnv();

export type Env = typeof env;
