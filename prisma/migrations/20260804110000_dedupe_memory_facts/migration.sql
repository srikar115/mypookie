-- Deduplicate memory_facts and prevent the duplicates from coming back.
--
-- The fact extractor runs on every turn with no knowledge of what is already
-- stored, and `insertFacts` did a bare INSERT. Re-stating something durable
-- across turns therefore wrote a new row each time. One production thread
-- accumulated 14 facts of which 11 were the identical string "The user is
-- named Karthik." Retrieval takes only the top MEMORY_TOP_K (5), so the whole
-- memory block was that one fact repeated, and genuinely useful facts —
-- dinner tonight, lunch tomorrow — never reached the prompt.
--
-- Two partial unique indexes, both scoped to rows that carry a characterId
-- (the only rows the insert path creates):
--   1. normalized content, which collapses verbatim repeats
--   2. IDENTITY metadata key, which collapses re-phrasings of the same
--      attribute ("The user is named X" vs "The user's name is X"). The
--      authoritative copy of identity lives in user_profiles.structuredFacts,
--      which upserts by key, so the memory_facts row is a duplicate of that
--      anyway.
-- Existing rows must be collapsed before the indexes can be created.

-- 1. Verbatim repeats: keep the earliest, which preserves the original
--    extractedAt and therefore the recency signal in hybrid search.
DELETE FROM "memory_facts" a
USING "memory_facts" b
WHERE a."characterId" IS NOT NULL
  AND b."characterId" IS NOT NULL
  AND a."userId" = b."userId"
  AND a."characterId" = b."characterId"
  AND lower(btrim(a."content")) = lower(btrim(b."content"))
  AND (a."extractedAt", a."id") > (b."extractedAt", b."id");

-- 2. Same IDENTITY attribute stated differently.
DELETE FROM "memory_facts" a
USING "memory_facts" b
WHERE a."characterId" IS NOT NULL
  AND b."characterId" IS NOT NULL
  AND a."userId" = b."userId"
  AND a."characterId" = b."characterId"
  AND a."category" = 'IDENTITY'
  AND b."category" = 'IDENTITY'
  AND a."metadata" ? 'key'
  AND b."metadata" ? 'key'
  AND a."metadata"->>'key' = b."metadata"->>'key'
  AND (a."extractedAt", a."id") > (b."extractedAt", b."id");

CREATE UNIQUE INDEX "memory_facts_user_character_content_key"
  ON "memory_facts" ("userId", "characterId", (lower(btrim("content"))))
  WHERE "characterId" IS NOT NULL;

CREATE UNIQUE INDEX "memory_facts_user_character_identity_key"
  ON "memory_facts" ("userId", "characterId", (("metadata"->>'key')))
  WHERE "characterId" IS NOT NULL
    AND "category" = 'IDENTITY'
    AND "metadata" ? 'key';
