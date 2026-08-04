-- ============================================================
-- Migration: 20260803120000_chat_media_generation
-- In-chat media (image / video) generation pipeline
--
-- Column types here are taken verbatim from `prisma migrate diff` so the
-- database matches schema.prisma exactly and no drift is introduced:
--   * ids are UUID with NO database default (the client supplies them via
--     IdGenerator, same as every other table in this schema)
--   * timestamps are TIMESTAMP(3), matching Prisma's default DateTime mapping
--
-- The four new ModelPurpose values are added here but only *used* by the
-- follow-up migration 20260803120100_seed_chat_media_model_configs. Postgres
-- forbids using a new enum value in the transaction that added it, so the
-- seed INSERTs must land in a separate migration.
-- ============================================================

-- ── 1. New enums for the media generation pipeline ──────────────────────────
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "MediaGenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- ── 2. Extend ModelPurpose with the in-chat generation slots ────────────────
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'CHAT_IMAGE_EDIT';
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'CHAT_IMAGE_TEXT_TO_IMAGE';
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'CHAT_VIDEO_TEXT_TO_VIDEO';
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'CHAT_VIDEO_IMAGE_TO_VIDEO';

-- ── 3. media_generations ────────────────────────────────────────────────────
CREATE TABLE "media_generations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "finalPrompt" TEXT,
    "modelSlug" TEXT,
    "providerRequestId" TEXT,
    "storageKey" TEXT,
    "storageUrl" TEXT,
    "costCredits" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_generations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_generations_userId_characterId_status_createdAt_idx"
    ON "media_generations" ("userId", "characterId", "status", "createdAt" DESC);
CREATE INDEX "media_generations_conversationId_createdAt_idx"
    ON "media_generations" ("conversationId", "createdAt" DESC);

-- ── 4. user_ai_prefs ────────────────────────────────────────────────────────
CREATE TABLE "user_ai_prefs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "imageModel" TEXT,
    "videoModel" TEXT,
    "imageAspect" TEXT,
    "videoAspect" TEXT,
    "videoDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_ai_prefs_userId_key" ON "user_ai_prefs" ("userId");

-- ── 5. Link a message to its generation ─────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN "mediaGenerationId" UUID;

-- ── 6. Foreign keys ─────────────────────────────────────────────────────────
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_mediaGenerationId_fkey"
        FOREIGN KEY ("mediaGenerationId") REFERENCES "media_generations"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "media_generations"
    ADD CONSTRAINT "media_generations_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_generations"
    ADD CONSTRAINT "media_generations_characterId_fkey"
        FOREIGN KEY ("characterId") REFERENCES "characters"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_generations"
    ADD CONSTRAINT "media_generations_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_ai_prefs"
    ADD CONSTRAINT "user_ai_prefs_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 7. Row Level Security (deny-by-default, matching every other table) ─────
ALTER TABLE "media_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_ai_prefs"     ENABLE ROW LEVEL SECURITY;
