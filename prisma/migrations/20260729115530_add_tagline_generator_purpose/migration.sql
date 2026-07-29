-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — LLM-generated character scenario descriptions                  │
-- │                                                                          │
-- │ Adds a `TAGLINE_GENERATOR` value to the `ModelPurpose` enum and seeds    │
-- │ a config row so the CreateCharacterDraft use case can resolve a model   │
-- │ at runtime (same pattern as CHAT/EXTRACTOR/SUMMARIZER). The output      │
-- │ populates `characters.tagline` + `.bio` — the Candy.ai-style scenario   │
-- │ prose ("Your rebellious stepsister…") shown under the character name.  │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── 1. Extend the enum ──────────────────────────────────────────────────
-- Postgres < 12 required a transaction dance for ADD VALUE; Supabase runs
-- 17+, so a plain ALTER TYPE is fine. IF NOT EXISTS guards against manual
-- environments where the value was already added out of band.
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'TAGLINE_GENERATOR';

-- ── 2. Seed the model config row ────────────────────────────────────────
-- Default: openai/gpt-4o-mini via OpenRouter. Character creation is a
-- one-time high-value event so the small quality/latency win of gpt-4o
-- full (or Claude Haiku 3.5) is worth admin consideration later — swap
-- {provider, modelId, endpoint} and it takes effect on the next
-- character created.
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'TAGLINE_GENERATOR',
    'OPENROUTER',
    'openai/gpt-4o-mini',
    'https://openrouter.ai/api/v1',
    '{"temperature": 0.85, "max_tokens": 220}'::jsonb,
    'Character tagline / scenario writer',
    'Writes the 2-3 sentence scenario blurb shown in the chat sidebar and the My AI gallery card. Called once per character during CreateCharacterDraft. Failure falls back to the templated bio, so a downed provider degrades gracefully.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  )
ON CONFLICT ("purpose") DO UPDATE SET
  "provider"   = EXCLUDED."provider",
  "modelId"    = EXCLUDED."modelId",
  "endpoint"   = EXCLUDED."endpoint",
  "parameters" = EXCLUDED."parameters",
  "label"      = EXCLUDED."label",
  "notes"      = EXCLUDED."notes",
  "isActive"   = EXCLUDED."isActive",
  "updatedAt"  = NOW();
