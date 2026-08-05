-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — add covering indexes for foreign keys                          │
-- │                                                                          │
-- │ Supabase's performance advisor (2026-08-04) flagged eight foreign keys  │
-- │ without covering indexes. Every ON DELETE CASCADE check and every       │
-- │ "everything for this character" filter on the child side currently      │
-- │ triggers a sequential scan on the entire child table. Tables are tiny  │
-- │ today so it's invisible — but `memory_facts` grows by ~1 row per        │
-- │ interesting turn per user, so we WILL feel it in months, not years.    │
-- │                                                                          │
-- │ Skipped by design (parent tables are static lookups — nobody deletes   │
-- │ from them, so the FK index has write cost without read benefit):        │
-- │   • characters.occupationId, personalityArchetypeId,                    │
-- │     relationshipArchetypeId, voicePresetId                              │
-- │   • model_configs.updatedByUserId (audit-only, tiny table)              │
-- │                                                                          │
-- │ Existing composite indexes DO NOT cover these lookups:                  │
-- │   • conversations has (userId, characterId) UNIQUE — characterId is    │
-- │     the trailing column, so btree can't use it for characterId-alone   │
-- │     scans (Postgres' well-known "leftmost-prefix rule").                │
-- │   • memory_facts has (userId, characterId) — same problem.             │
-- │   • relationship_states has (userId, characterId) UNIQUE — same.       │
-- │   • relationship_milestones has (userId, characterId, occurredAt DESC) │
-- │     — same. And call_sessions / media_generations similarly.           │
-- │ Single-column btree is the minimum-cost fix.                            │
-- │                                                                          │
-- │ NOT `CONCURRENTLY` — Prisma wraps each migration file in a transaction │
-- │ and `CREATE INDEX CONCURRENTLY` cannot run inside one. On these        │
-- │ tables (all under 1k rows in dev) the plain form takes <100ms per     │
-- │ index and blocks only writes on that table for that window. If any of │
-- │ these tables ever crosses ~1M rows before this migration ships to     │
-- │ prod, rebuild the missing index CONCURRENTLY via a one-off admin     │
-- │ script instead of re-running this migration.                          │
-- │                                                                          │
-- │ `IF NOT EXISTS` makes re-runs a safe no-op.                            │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Memory facts — highest-growth child table; every character delete or
-- "load this character's memories" query used to full-scan the table.
CREATE INDEX IF NOT EXISTS "memory_facts_characterId_idx"
    ON "memory_facts" ("characterId");

-- SetNull cascade: when a source Message is deleted the DB must find every
-- fact that referenced it. Without this index that's a seq scan on
-- memory_facts (fast growing) per message delete.
CREATE INDEX IF NOT EXISTS "memory_facts_sourceMessageId_idx"
    ON "memory_facts" ("sourceMessageId");

-- Conversations — sidebar "conversations for this character" and every
-- character deletion cascade.
CREATE INDEX IF NOT EXISTS "conversations_characterId_idx"
    ON "conversations" ("characterId");

-- Messages → media_generations join. mediaGenerationId is nullable so the
-- index is sparse — cheap to maintain, essential for the JOIN.
CREATE INDEX IF NOT EXISTS "messages_mediaGenerationId_idx"
    ON "messages" ("mediaGenerationId");

-- Voice call history by character.
CREATE INDEX IF NOT EXISTS "call_sessions_characterId_idx"
    ON "call_sessions" ("characterId");

-- Media generations by character (gallery view + delete cascade).
CREATE INDEX IF NOT EXISTS "media_generations_characterId_idx"
    ON "media_generations" ("characterId");

-- Relationship state / milestones — loaded on EVERY chat turn to build
-- the memory context block; character delete cascade also hits both.
CREATE INDEX IF NOT EXISTS "relationship_states_characterId_idx"
    ON "relationship_states" ("characterId");

CREATE INDEX IF NOT EXISTS "relationship_milestones_characterId_idx"
    ON "relationship_milestones" ("characterId");
