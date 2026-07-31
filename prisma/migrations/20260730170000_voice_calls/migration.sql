-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — Voice call feature                                            │
-- │                                                                          │
-- │ Adds the persistence deltas for real-time voice calls on the LiveKit +  │
-- │ Deepgram + Cartesia stack. Text turns and voice turns share the same    │
-- │ `messages` table (distinguished by `source`) so a mixed thread reads    │
-- │ back as one continuous conversation.                                    │
-- │                                                                          │
-- │   1. New MessageSource enum (TEXT | VOICE).                             │
-- │   2. New columns on `messages`: source, audioR2Key, ttsMarkupTags.      │
-- │   3. New ModelPurpose values: VOICE_STT, VOICE_LLM, VOICE_TTS.          │
-- │   4. New ModelProvider values: DEEPGRAM, CARTESIA, LIVEKIT.             │
-- │   5. New column on `users`: voiceCallsBeta boolean flag.                │
-- │   6. New table `call_sessions` — one row per real-time call, created    │
-- │      eagerly at token issuance and finalized on hang-up.                │
-- │                                                                          │
-- │ Voice-model rows (Deepgram Nova-3, Euryale :nitro, Cartesia Sonic-3.5) │
-- │ are seeded by a follow-up script — see                                  │
-- │ scripts/seed-voice-model-configs.mjs.                                   │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── 1. MessageSource enum ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageSource') THEN
    CREATE TYPE "MessageSource" AS ENUM ('TEXT', 'VOICE');
  END IF;
END $$;

-- ── 2. Message table columns ──────────────────────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "source"        "MessageSource" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS "audioR2Key"    TEXT,
  ADD COLUMN IF NOT EXISTS "ttsMarkupTags" TEXT[]          NOT NULL DEFAULT '{}';

-- ── 3. ModelPurpose enum expansion ────────────────────────────────────────
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'VOICE_STT';
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'VOICE_LLM';
ALTER TYPE "ModelPurpose" ADD VALUE IF NOT EXISTS 'VOICE_TTS';

-- ── 4. ModelProvider enum expansion ───────────────────────────────────────
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'DEEPGRAM';
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'CARTESIA';
ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'LIVEKIT';

-- ── 5. User voice-beta flag ───────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "voiceCallsBeta" BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 6. call_sessions table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "call_sessions" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID        NOT NULL,
  "userId"         UUID        NOT NULL,
  "characterId"    UUID        NOT NULL,
  "livekitRoom"    TEXT        NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "endedAt"        TIMESTAMP(3),
  "durationSec"    INTEGER,
  "turnCount"      INTEGER     NOT NULL DEFAULT 0,
  "costCredits"    INTEGER     NOT NULL DEFAULT 0,
  "dropReason"     TEXT,
  "summary"        TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_sessions_livekitRoom_key" UNIQUE ("livekitRoom"),
  CONSTRAINT "call_sessions_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "call_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "call_sessions_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE
);

-- Query shapes:
--   - list a conversation's calls, most-recent first (thread history view)
--   - list a user's recent calls (usage screen, credit reconciliation)
--   - concurrent-call guard: WHERE userId=? AND endedAt IS NULL
CREATE INDEX IF NOT EXISTS "call_sessions_conversationId_startedAt_idx"
  ON "call_sessions" ("conversationId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "call_sessions_userId_startedAt_idx"
  ON "call_sessions" ("userId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "call_sessions_userId_endedAt_idx"
  ON "call_sessions" ("userId", "endedAt");

-- RLS enabled but no policies — same convention as messages/conversations.
-- Prisma superuser bypasses; browser never touches this table directly.
ALTER TABLE "call_sessions" ENABLE ROW LEVEL SECURITY;
