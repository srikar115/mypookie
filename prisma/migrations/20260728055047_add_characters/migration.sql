-- CreateEnum
CREATE TYPE "BaseStyle" AS ENUM ('REALISTIC', 'ANIME', 'THREE_D', 'CARTOON');

-- CreateEnum
CREATE TYPE "Ethnicity" AS ENUM ('CAUCASIAN', 'LATINA', 'ASIAN', 'ARAB', 'EBONY', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NONBINARY');

-- CreateEnum
CREATE TYPE "EyeColor" AS ENUM ('BROWN', 'BLUE', 'GREEN', 'HAZEL', 'AMBER', 'GRAY', 'VIOLET', 'HETEROCHROMIA');

-- CreateEnum
CREATE TYPE "HairStyle" AS ENUM ('STRAIGHT', 'WAVY', 'CURLY', 'BANGS', 'PONYTAIL', 'BOB', 'PIXIE', 'BRAIDS', 'UPDO');

-- CreateEnum
CREATE TYPE "HairColor" AS ENUM ('BLACK', 'BROWN', 'BLONDE', 'RED', 'AUBURN', 'WHITE', 'SILVER', 'PINK', 'PURPLE', 'BLUE', 'FANTASY_OTHER');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('SLIM', 'ATHLETIC', 'CURVY', 'PLUS_SIZE', 'PETITE', 'VOLUPTUOUS');

-- CreateEnum
CREATE TYPE "SizeTier" AS ENUM ('XS', 'S', 'M', 'L', 'XL');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CharacterVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CharacterModerationStatus" AS ENUM ('APPROVED', 'UNDER_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('MOCK_TTS', 'ELEVENLABS', 'OPENAI_REALTIME', 'CARTESIA', 'PLAYHT');

-- CreateEnum
CREATE TYPE "ConstraintTier" AS ENUM ('HARD', 'TEMPORAL', 'SOFT', 'EMERGENT');

-- CreateTable
CREATE TABLE "personality_archetypes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "promptFragment" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personality_archetypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_archetypes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "promptFragment" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_archetypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_occupations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "promptFragment" TEXT NOT NULL,
    "icon" TEXT,
    "isNsfwOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_occupations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_presets" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "provider" "VoiceProvider" NOT NULL,
    "providerVoiceId" TEXT NOT NULL,
    "sampleR2Key" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "birthdate" DATE NOT NULL,
    "baseStyle" "BaseStyle" NOT NULL,
    "ethnicity" "Ethnicity" NOT NULL,
    "gender" "Gender" NOT NULL,
    "ageYears" INTEGER NOT NULL,
    "eyeColor" "EyeColor" NOT NULL,
    "hairStyle" "HairStyle" NOT NULL,
    "hairColor" "HairColor" NOT NULL,
    "bodyType" "BodyType" NOT NULL,
    "bustSize" "SizeTier",
    "hipSize" "SizeTier",
    "clothing" TEXT,
    "personalityArchetypeId" UUID NOT NULL,
    "relationshipArchetypeId" UUID NOT NULL,
    "occupationId" UUID NOT NULL,
    "voicePresetId" UUID NOT NULL,
    "flirtation" INTEGER NOT NULL DEFAULT 50,
    "patience" INTEGER NOT NULL DEFAULT 50,
    "moodVolatility" INTEGER NOT NULL DEFAULT 50,
    "dominance" INTEGER NOT NULL DEFAULT 50,
    "language" TEXT NOT NULL DEFAULT 'en',
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nsfwOptIn" BOOLEAN NOT NULL DEFAULT false,
    "tagline" TEXT,
    "backstory" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "appearancePrompt" TEXT NOT NULL,
    "bio" TEXT,
    "promptCompiledAt" TIMESTAMP(3) NOT NULL,
    "status" "CharacterStatus" NOT NULL DEFAULT 'DRAFT',
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3),
    "visibility" "CharacterVisibility" NOT NULL DEFAULT 'PRIVATE',
    "moderationStatus" "CharacterModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "featuredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_appearance_profiles" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "appearancePrompt" TEXT NOT NULL,
    "referenceImageR2Key" TEXT,
    "faceEmbedding" vector(512),
    "faceKeypoints" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_appearance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_edit_history" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "editorUserId" UUID NOT NULL,
    "tier" "ConstraintTier" NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personality_archetypes_slug_key" ON "personality_archetypes"("slug");

-- CreateIndex
CREATE INDEX "personality_archetypes_isActive_sortOrder_idx" ON "personality_archetypes"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_archetypes_slug_key" ON "relationship_archetypes"("slug");

-- CreateIndex
CREATE INDEX "relationship_archetypes_isActive_sortOrder_idx" ON "relationship_archetypes"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "character_occupations_slug_key" ON "character_occupations"("slug");

-- CreateIndex
CREATE INDEX "character_occupations_isActive_sortOrder_idx" ON "character_occupations"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "character_occupations_isNsfwOnly_idx" ON "character_occupations"("isNsfwOnly");

-- CreateIndex
CREATE UNIQUE INDEX "voice_presets_slug_key" ON "voice_presets"("slug");

-- CreateIndex
CREATE INDEX "voice_presets_isActive_sortOrder_idx" ON "voice_presets"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "characters_ownerUserId_idx" ON "characters"("ownerUserId");

-- CreateIndex
CREATE INDEX "characters_ownerUserId_status_idx" ON "characters"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "characters_visibility_moderationStatus_idx" ON "characters"("visibility", "moderationStatus");

-- CreateIndex
CREATE INDEX "characters_featuredAt_idx" ON "characters"("featuredAt");

-- CreateIndex
CREATE INDEX "character_appearance_profiles_characterId_isActive_idx" ON "character_appearance_profiles"("characterId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "character_appearance_profiles_characterId_version_key" ON "character_appearance_profiles"("characterId", "version");

-- CreateIndex
CREATE INDEX "character_edit_history_characterId_createdAt_idx" ON "character_edit_history"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "character_edit_history_editorUserId_idx" ON "character_edit_history"("editorUserId");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_personalityArchetypeId_fkey" FOREIGN KEY ("personalityArchetypeId") REFERENCES "personality_archetypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_relationshipArchetypeId_fkey" FOREIGN KEY ("relationshipArchetypeId") REFERENCES "relationship_archetypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_occupationId_fkey" FOREIGN KEY ("occupationId") REFERENCES "character_occupations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_voicePresetId_fkey" FOREIGN KEY ("voicePresetId") REFERENCES "voice_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_appearance_profiles" ADD CONSTRAINT "character_appearance_profiles_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_edit_history" ADD CONSTRAINT "character_edit_history_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_edit_history" ADD CONSTRAINT "character_edit_history_editorUserId_fkey" FOREIGN KEY ("editorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Domain-invariant CHECK constraints ───────────────────────────────────────
-- Legal age floor (product-research.md §9.1 — every character must be 18+).
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_age_18_plus_check"
  CHECK ("ageYears" >= 18);

-- Wizard step 8 (screenshot 1) allows up to 3 hobbies.
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_hobbies_max_3_check"
  CHECK (array_length("hobbies", 1) IS NULL OR array_length("hobbies", 1) <= 3);

-- Discover-feed tag cap.
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_tags_max_8_check"
  CHECK (array_length("tags", 1) IS NULL OR array_length("tags", 1) <= 8);

-- Regeneration counter cap (screenshot 7 "Regenerate (0/2)").
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_regeneration_count_max_2_check"
  CHECK ("regenerationCount" BETWEEN 0 AND 2);

-- Behavioral sliders live in [0, 100].
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_flirtation_range_check"
  CHECK ("flirtation" BETWEEN 0 AND 100);
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_patience_range_check"
  CHECK ("patience" BETWEEN 0 AND 100);
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_mood_volatility_range_check"
  CHECK ("moodVolatility" BETWEEN 0 AND 100);
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_dominance_range_check"
  CHECK ("dominance" BETWEEN 0 AND 100);

-- Committed timestamp is present iff status is not DRAFT.
ALTER TABLE "characters"
  ADD CONSTRAINT "characters_committed_at_status_check"
  CHECK (
    ("status" = 'DRAFT' AND "committedAt" IS NULL) OR
    ("status" <> 'DRAFT' AND "committedAt" IS NOT NULL)
  );

-- Appearance profile versions start at 1.
ALTER TABLE "character_appearance_profiles"
  ADD CONSTRAINT "character_appearance_profiles_version_positive_check"
  CHECK ("version" >= 1);

-- ── Discovery & search indexes (extensions live in the `extensions` schema) ─
-- Trigram fuzzy search on character name for the discover feed.
CREATE INDEX "characters_name_trgm_idx"
  ON "characters"
  USING gin ("name" extensions.gin_trgm_ops);

-- Trigram fuzzy search on tagline (only for rows that have one).
CREATE INDEX "characters_tagline_trgm_idx"
  ON "characters"
  USING gin ("tagline" extensions.gin_trgm_ops)
  WHERE "tagline" IS NOT NULL;

-- Faceted filter on tags array.
CREATE INDEX "characters_tags_gin_idx"
  ON "characters"
  USING gin ("tags");

-- Face-identity similarity search (pgvector HNSW; cosine distance).
-- HNSW is preferred over IVFFlat at our scale (<1M rows) — no training step,
-- better recall/latency tradeoff.
CREATE INDEX "character_appearance_profiles_face_embedding_idx"
  ON "character_appearance_profiles"
  USING hnsw ("faceEmbedding" extensions.vector_cosine_ops);

-- ── Row Level Security (Supabase defense-in-depth, matches init migration) ──
-- Every new table gets RLS enabled with no policies attached, so the Supabase
-- Data API (anon/authenticated roles) sees nothing. Prisma connects as the
-- `postgres` superuser and bypasses RLS, so application code is unaffected.

ALTER TABLE "personality_archetypes"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_archetypes"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "character_occupations"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voice_presets"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "characters"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "character_appearance_profiles"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "character_edit_history"         ENABLE ROW LEVEL SECURITY;
