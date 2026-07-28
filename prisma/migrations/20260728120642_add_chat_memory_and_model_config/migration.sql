-- CreateEnum
CREATE TYPE "ModelPurpose" AS ENUM ('CHAT', 'EXTRACTOR', 'SUMMARIZER', 'IMAGE_TEXT_TO_IMAGE', 'IMAGE_IMAGE_TO_IMAGE', 'VIDEO_IMAGE_TO_VIDEO', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "ModelProvider" AS ENUM ('OPENROUTER', 'OPENAI', 'ANTHROPIC', 'FAL');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('IDENTITY', 'PREFERENCE', 'RELATIONSHIP', 'EVENT', 'PLAN', 'EMOTION', 'OPINION', 'COMMITMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "RelationshipTier" AS ENUM ('STRANGER', 'ACQUAINTANCE', 'FRIEND', 'CLOSE_FRIEND', 'ROMANTIC_INTEREST', 'PARTNER', 'SOULMATE');

-- NOTE: Prisma initially emitted three `DROP INDEX` statements here for
-- indexes created via raw SQL in the initial characters migration
-- (`character_appearance_profiles_face_embedding_idx`,
-- `characters_name_trgm_idx`, `characters_tags_gin_idx`). Those indexes are
-- intentionally not modelled in schema.prisma (Prisma can't express HNSW /
-- pg_trgm operator classes), and dropping them would regress discover
-- search and face-identity similarity. The statements have been removed —
-- see .agents/docs/schema.md for the drift rationale.

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "structuredFacts" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "model_configs" (
    "id" UUID NOT NULL,
    "purpose" "ModelPurpose" NOT NULL,
    "provider" "ModelProvider" NOT NULL,
    "modelId" TEXT NOT NULL,
    "endpoint" TEXT,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'READY',
    "content" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "modelId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "turnsCovered" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_facts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID,
    "content" TEXT NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "valence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "sourceMessageId" UUID,
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1024),
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "memory_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_states" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "trust" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "affection" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "respect" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "familiarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tension" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "affinity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier" "RelationshipTier" NOT NULL DEFAULT 'STRANGER',
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_milestones" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_configs_purpose_key" ON "model_configs"("purpose");

-- CreateIndex
CREATE INDEX "model_configs_purpose_isActive_idx" ON "model_configs"("purpose", "isActive");

-- CreateIndex
CREATE INDEX "conversations_userId_lastMessageAt_idx" ON "conversations"("userId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_userId_characterId_key" ON "conversations"("userId", "characterId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_summaries_conversationId_key" ON "conversation_summaries"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_states_userId_characterId_key" ON "relationship_states"("userId", "characterId");

-- CreateIndex
CREATE INDEX "relationship_milestones_userId_characterId_occurredAt_idx" ON "relationship_milestones"("userId", "characterId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_states" ADD CONSTRAINT "relationship_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_states" ADD CONSTRAINT "relationship_states_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_milestones" ADD CONSTRAINT "relationship_milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_milestones" ADD CONSTRAINT "relationship_milestones_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Domain-invariant CHECK constraints (memory-architecture §7 + §8) ───────
-- Facts have signed valence in [-1, 1] and confidence in [0, 1].
ALTER TABLE "memory_facts"
  ADD CONSTRAINT "memory_facts_valence_range_check"
  CHECK ("valence" BETWEEN -1 AND 1);
ALTER TABLE "memory_facts"
  ADD CONSTRAINT "memory_facts_confidence_range_check"
  CHECK ("confidence" BETWEEN 0 AND 1);

-- Relationship state axes all live in [0, 100]. Affinity is a derived signed
-- axis in [-100, 100] (positive = warmth, negative = friction).
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_trust_range_check"
  CHECK ("trust" BETWEEN 0 AND 100);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_affection_range_check"
  CHECK ("affection" BETWEEN 0 AND 100);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_respect_range_check"
  CHECK ("respect" BETWEEN 0 AND 100);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_familiarity_range_check"
  CHECK ("familiarity" BETWEEN 0 AND 100);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_tension_range_check"
  CHECK ("tension" BETWEEN 0 AND 100);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_affinity_range_check"
  CHECK ("affinity" BETWEEN -100 AND 100);

-- Memory turn counts are non-negative.
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_total_messages_nonneg_check"
  CHECK ("totalMessages" >= 0);
ALTER TABLE "relationship_states"
  ADD CONSTRAINT "relationship_states_streak_days_nonneg_check"
  CHECK ("streakDays" >= 0);
ALTER TABLE "conversation_summaries"
  ADD CONSTRAINT "conversation_summaries_turns_covered_nonneg_check"
  CHECK ("turnsCovered" >= 0);

-- ── Memory retrieval indexes (hybrid: BM25 + entity + recency) ─────────────
-- BM25/GIN over the fact text for keyword recall.
CREATE INDEX "memory_facts_content_gin_idx"
  ON "memory_facts"
  USING gin (to_tsvector('english', "content"));

-- Entity GIN — the extractor tags every fact with named entities so recall
-- for "tell me about Max" hits without a full-text scan.
CREATE INDEX "memory_facts_entities_gin_idx"
  ON "memory_facts"
  USING gin ("entities");

-- Tenancy filter — every retrieval query starts with (userId, characterId?).
CREATE INDEX "memory_facts_user_char_idx"
  ON "memory_facts" ("userId", "characterId");

-- Recency tie-breaker for the hybrid searcher.
CREATE INDEX "memory_facts_user_extracted_idx"
  ON "memory_facts" ("userId", "extractedAt" DESC);

-- HNSW index on the embedding column is intentionally deferred — column is
-- nullable and ships without an index. When the embedder + backfill land,
-- a follow-up migration will `CREATE INDEX ... USING hnsw ("embedding" extensions.vector_cosine_ops)`.

-- ── Row Level Security (Supabase defense-in-depth) ─────────────────────────
-- All seven new tables enable RLS with no policies attached, so the Supabase
-- Data API (anon/authenticated roles) can't see them. Prisma connects as the
-- `postgres` superuser and bypasses RLS, so application code is unaffected.
ALTER TABLE "model_configs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_summaries"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_facts"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_states"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relationship_milestones" ENABLE ROW LEVEL SECURITY;

-- ── Seed model_configs (idempotent, one active row per purpose) ────────────
-- Only ACTIVE rows are seeded here; EMBEDDING is intentionally omitted
-- (added in a follow-up when the embedder ships). VIDEO_IMAGE_TO_VIDEO is
-- seeded as INACTIVE so the row exists for admin UX but adapters throw
-- `ModelNotConfiguredError` until an admin flips it on.
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'CHAT',
    'OPENROUTER',
    'sao10k/l3.3-euryale-70b',
    'https://openrouter.ai/api/v1',
    '{"temperature": 0.9, "max_tokens": 512, "top_p": 0.95}'::jsonb,
    'Euryale 70B — companion mode',
    'Primary chat model. Swap to a cheaper model (e.g. thedrummer/rocinante-12b) when cost spikes.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'EXTRACTOR',
    'OPENROUTER',
    'openai/gpt-4o-mini',
    'https://openrouter.ai/api/v1',
    '{"temperature": 0.2, "response_format": {"type": "json_object"}}'::jsonb,
    'GPT-4o-mini — memory fact extractor',
    'JSON-mode extractor for MemoryFact rows.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'SUMMARIZER',
    'OPENROUTER',
    'openai/gpt-4o-mini',
    'https://openrouter.ai/api/v1',
    '{"temperature": 0.4, "max_tokens": 800}'::jsonb,
    'GPT-4o-mini — session summarizer',
    'Rolls up long threads into ConversationSummary rows.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'IMAGE_TEXT_TO_IMAGE',
    'FAL',
    'fal-ai/z-image/turbo',
    NULL,
    '{"num_inference_steps": 8, "image_size": "portrait_4_3", "enable_safety_checker": false}'::jsonb,
    'Z-Image Turbo — text→image',
    'Used by the character wizard for first-render appearance generation.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'IMAGE_IMAGE_TO_IMAGE',
    'FAL',
    'fal-ai/z-image/turbo/image-to-image',
    NULL,
    '{"num_inference_steps": 8, "strength": 0.7, "image_size": "portrait_4_3", "enable_safety_checker": false}'::jsonb,
    'Z-Image Turbo — image→image',
    'Used by the wizard for regenerations that preserve face identity.',
    TRUE,
    NULL,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'VIDEO_IMAGE_TO_VIDEO',
    'FAL',
    'fal-ai/wan-i2v',
    NULL,
    '{"num_frames": 81, "fps": 16}'::jsonb,
    'WAN i2v — placeholder (inactive)',
    'Placeholder row so admins see the slot; flip isActive when the composer button ships.',
    FALSE,
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
