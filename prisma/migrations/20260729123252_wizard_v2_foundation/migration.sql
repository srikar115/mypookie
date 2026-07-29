-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — Wizard v2 foundation                                          │
-- │                                                                          │
-- │ Prep work for the Candy.ai-style visual character wizard rebuild.      │
-- │                                                                          │
-- │   1. WIPE all existing character rows (user explicitly opted in).       │
-- │      Cascades through appearance profiles, conversations, messages,    │
-- │      memory facts, summaries, and relationship state.                  │
-- │                                                                          │
-- │   2. Expand `Gender` — TRANS_WOMAN, TRANS_MAN join the existing         │
-- │      FEMALE/MALE/NONBINARY set. Image prompts will branch on these.    │
-- │                                                                          │
-- │   3. Expand `Ethnicity` — the old set (CAUCASIAN, LATINA, ASIAN, ARAB,  │
-- │      EBONY, MIXED, OTHER) is too coarse for Candy's Heritage picker.   │
-- │      New values map to the reference screenshots: EAST_ASIAN,          │
-- │      SOUTHEAST_ASIAN, SOUTH_ASIAN, MIDDLE_EASTERN, NORTH_AFRICAN,      │
-- │      BLACK, CARIBBEAN, EUROPEAN. Old values stay in the enum so this   │
-- │      migration is additive and future admin data isn't disturbed.     │
-- │                                                                          │
-- │   4. New `FashionStyle` enum + `characters.fashionStyle` column.       │
-- │      Powers the Fashion step and adjusts the wardrobe prompt pool at   │
-- │      generation time.                                                  │
-- │                                                                          │
-- │   5. New `wizard_option_previews` table — one row per                  │
-- │      (optionType, optionValue, baseStyle, gender) combo, holding the   │
-- │      AI-generated preview image the wizard tile renders. Populated     │
-- │      lazily by an admin seeder script (Phase 3). Wizard reads gate on   │
-- │      presence; missing preview → the tile falls back to a text label.  │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── 1. Wipe character-related tables ──────────────────────────────────────
-- CASCADE takes conversations/messages/memory/etc. with it via FK
-- ON DELETE CASCADE definitions in the init + chat/memory migrations.
-- User accounts, user_profiles, model_configs, and the character lookup
-- tables (personality/relationship/occupation/voice) are untouched.
TRUNCATE TABLE
  "characters",
  "character_appearance_profiles",
  "conversations",
  "messages",
  "conversation_summaries",
  "memory_facts",
  "relationship_states",
  "relationship_milestones"
RESTART IDENTITY CASCADE;

-- ── 2. Gender enum expansion ──────────────────────────────────────────────
-- PG 17 supports ALTER TYPE ... ADD VALUE outside a transaction — but our
-- migration runner wraps everything in a transaction. To keep this
-- migration atomic AND additive to the enum, each ADD VALUE gets its own
-- COMMIT boundary in the runner. Prisma's runner splits on ';' so the
-- effect is fine here; if a future runner batches, we can switch to
-- explicit `BEGIN;/COMMIT;` blocks.
ALTER TYPE "Gender" ADD VALUE IF NOT EXISTS 'TRANS_WOMAN';
ALTER TYPE "Gender" ADD VALUE IF NOT EXISTS 'TRANS_MAN';

-- ── 3. Ethnicity enum expansion ───────────────────────────────────────────
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'EAST_ASIAN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'SOUTHEAST_ASIAN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'SOUTH_ASIAN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'MIDDLE_EASTERN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'NORTH_AFRICAN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'BLACK';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'CARIBBEAN';
ALTER TYPE "Ethnicity" ADD VALUE IF NOT EXISTS 'EUROPEAN';

-- ── 4. FashionStyle enum + column on characters ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FashionStyle') THEN
    CREATE TYPE "FashionStyle" AS ENUM (
      'CASUAL_CHIC',
      'ELEGANT',
      'STREETWEAR',
      'BOHEMIAN',
      'GOTH',
      'ANIME_FASHION',
      'SPORTY'
    );
  END IF;
END $$;

ALTER TABLE "characters"
  ADD COLUMN IF NOT EXISTS "fashionStyle" "FashionStyle";

-- ── 5. wizard_option_previews table ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WizardOptionType') THEN
    CREATE TYPE "WizardOptionType" AS ENUM (
      'GENDER',
      'LOOK',
      'BOND',
      'PERSONALITY',
      'AGE_BUCKET',
      'ETHNICITY',
      'HAIR_COLOR',
      'HAIR_STYLE',
      'EYE_COLOR',
      'BODY_TYPE',
      'FASHION'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "wizard_option_previews" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "optionType"      "WizardOptionType" NOT NULL,
  -- Free-form string so we can reference values that live in unrelated
  -- enums (Gender / Ethnicity / HairColor / …) or slug-based lookups
  -- (personality/relationship archetype slugs). The (type, value, style,
  -- gender) unique constraint below still gives us hard idempotency.
  "optionValue"     TEXT          NOT NULL,
  "baseStyle"       "BaseStyle"   NOT NULL,
  "gender"          "Gender"      NOT NULL,
  "imageR2Key"      TEXT          NOT NULL,
  "imageUrl"        TEXT          NOT NULL,
  -- Snapshot of the fal.ai prompt so admins can audit / regenerate.
  "promptSnapshot"  TEXT          NOT NULL,
  "generatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedByUserId" UUID,
  CONSTRAINT "wizard_option_previews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wizard_option_previews_unique"
    UNIQUE ("optionType", "optionValue", "baseStyle", "gender")
);

-- Fast read path for the wizard boot: fetch all previews scoped to the
-- user's selected (baseStyle, gender). Composite index matches the
-- lookup shape.
CREATE INDEX IF NOT EXISTS "wizard_option_previews_style_gender_idx"
  ON "wizard_option_previews" ("baseStyle", "gender", "optionType");

-- RLS enabled but no policies — same convention as other read-only
-- reference tables (model_configs, character_lookups). Prisma
-- superuser bypasses; browser-side access never happens.
ALTER TABLE "wizard_option_previews" ENABLE ROW LEVEL SECURITY;
