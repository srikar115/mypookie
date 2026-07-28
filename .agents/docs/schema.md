# Database Schema — Amorify

> **Single source of truth for database schema evolution.**
> Every schema migration created by `prisma migrate dev` **MUST** be added to this file with full information (rationale, tables/columns changed, indexes, enums, relations, and rollback notes).
> Keep entries in reverse-chronological order (newest first).

---

## Overview

- **Engine:** PostgreSQL 15+
- **Driver:** `pg` via `@prisma/adapter-pg`
- **ORM:** Prisma 7
- **Database name:** `mypookie`
- **Schema:** `public`

---

## Migration Log

### Template

Copy this block for every new migration.

```md
### YYYYMMDD_HHMMSS_<migration_name>

**Date:** YYYY-MM-DD
**Author:** <name / agent>
**Status:** Applied | Pending | Reverted

#### Purpose
One-paragraph rationale — what business/domain need does this satisfy?

#### Changes
- **New tables:** `table_name` — one-line description
- **Altered tables:** `table_name` — what changed
- **Dropped tables:** `table_name`
- **New enums:** `EnumName` (VALUE_A, VALUE_B, …)
- **New indexes:** `idx_name` on `table(column)`
- **Foreign keys / relations:** `child.column → parent.column` (onDelete)

#### Table Details
For each new/altered table:

##### `table_name`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| … | … | … | … | … |

**Indexes:** `idx_a` (unique), `idx_b`
**Relations:** `→ other_table.id`

#### Rollback
How to safely revert this migration if needed.

#### Related PRs / Issues
Link references.
```

---

## Migrations

<!--
Newest entries at the top.
-->

### 20260728120642_add_chat_memory_and_model_config

**Date:** 2026-07-28
**Author:** amorify agent
**Status:** Applied

#### Purpose
Ships the persistence layer for candy.ai-style live chat with the full 3-layer memory stack (turns, session summaries, extracted facts, relationship state, milestones) **minus semantic embeddings and HNSW indexing** — those land as a follow-up. Also introduces `model_configs`: a single source of truth for LLM/image/embedding model IDs, endpoints, and per-model parameters, so admins can swap models at runtime without touching `.env` or redeploying.

Retrieval in v1 relies on BM25 + entity match + recency (no vectors); the `embedding vector(1024)` column ships nullable on `memory_facts` so the follow-up embedder migration only needs to populate + index it.

#### Changes
- **New tables:**
  - `model_configs` — one active row per `ModelPurpose`; provider + modelId + endpoint + parameters JSON + admin metadata
  - `conversations` — one per (user, character); tracks `lastMessageAt` for sidebar ordering
  - `messages` — user/assistant/system rows with `modelId` snapshot for history stability
  - `conversation_summaries` — one per conversation; rolling summary for long-thread compression
  - `memory_facts` — Layer 2 extracted facts with entities, valence, confidence, nullable `vector(1024)` embedding
  - `relationship_states` — one per (user, character); five 0-100 axes + affinity + tier + streaks
  - `relationship_milestones` — append-only event log for narrative continuity
- **Altered tables:**
  - `user_profiles.structuredFacts JSONB DEFAULT '{}'` — Layer 3b explicit KV facts (name, birthday, pronouns, job)
- **New enums:**
  - `ModelPurpose` (CHAT / EXTRACTOR / SUMMARIZER / IMAGE_TEXT_TO_IMAGE / IMAGE_IMAGE_TO_IMAGE / VIDEO_IMAGE_TO_VIDEO / EMBEDDING)
  - `ModelProvider` (OPENROUTER / OPENAI / ANTHROPIC / FAL)
  - `MessageRole` (USER / ASSISTANT / SYSTEM)
  - `MessageStatus` (READY / FAILED)
  - `MemoryCategory` (IDENTITY / PREFERENCE / RELATIONSHIP / EVENT / PLAN / EMOTION / OPINION / COMMITMENT / OTHER)
  - `RelationshipTier` (STRANGER / ACQUAINTANCE / FRIEND / CLOSE_FRIEND / ROMANTIC_INTEREST / PARTNER / SOULMATE)
- **Foreign keys / relations:**
  - `model_configs.updatedByUserId → users.id` (SET NULL)
  - `conversations.userId → users.id` (CASCADE), `conversations.characterId → characters.id` (CASCADE)
  - `messages.conversationId → conversations.id` (CASCADE)
  - `conversation_summaries.conversationId → conversations.id` (CASCADE, unique)
  - `memory_facts.userId → users.id` (CASCADE), `memory_facts.characterId → characters.id` (CASCADE, nullable), `memory_facts.sourceMessageId → messages.id` (SET NULL)
  - `relationship_states.userId → users.id` (CASCADE), `relationship_states.characterId → characters.id` (CASCADE, UNIQUE (userId, characterId))
  - `relationship_milestones.userId → users.id` (CASCADE), `relationship_milestones.characterId → characters.id` (CASCADE)
- **CHECK constraints:**
  - `memory_facts.valence` ∈ [-1, 1]; `memory_facts.confidence` ∈ [0, 1]
  - `relationship_states.trust / affection / respect / familiarity / tension` ∈ [0, 100]
  - `relationship_states.affinity` ∈ [-100, 100]
  - `relationship_states.totalMessages / streakDays >= 0`; `conversation_summaries.turnsCovered >= 0`
- **Indexes:**
  - Standard Prisma btree on all FKs plus `conversations (userId, lastMessageAt DESC)`, `messages (conversationId, createdAt)`, `relationship_milestones (userId, characterId, occurredAt DESC)`, unique `conversations (userId, characterId)`, unique `relationship_states (userId, characterId)`, unique `model_configs.purpose`
  - `memory_facts_content_gin_idx` — GIN on `to_tsvector('english', content)` for BM25 keyword recall
  - `memory_facts_entities_gin_idx` — GIN on `entities` text[] for named-entity lookup ("who is Max?")
  - `memory_facts_user_char_idx` — btree (userId, characterId) tenancy prefilter
  - `memory_facts_user_extracted_idx` — btree (userId, extractedAt DESC) recency tie-breaker
  - HNSW on `memory_facts.embedding` **intentionally deferred** — column is nullable and unindexed until embedder ships
- **Row Level Security:** enabled on all 7 new tables with no policies (Prisma bypasses via superuser; Supabase Data API sees nothing).
- **Seed rows (`model_configs`, idempotent via `ON CONFLICT (purpose) DO UPDATE`):**
  - `CHAT`: OpenRouter `sao10k/l3.3-euryale-70b`, `{ temperature: 0.9, max_tokens: 512, top_p: 0.95 }`
  - `EXTRACTOR`: OpenRouter `openai/gpt-4o-mini`, `{ temperature: 0.2, response_format: json_object }`
  - `SUMMARIZER`: OpenRouter `openai/gpt-4o-mini`, `{ temperature: 0.4, max_tokens: 800 }`
  - `IMAGE_TEXT_TO_IMAGE`: Fal `fal-ai/z-image/turbo`, `{ num_inference_steps: 8, image_size: portrait_4_3, enable_safety_checker: false }`
  - `IMAGE_IMAGE_TO_IMAGE`: Fal `fal-ai/z-image/turbo`, `{ num_inference_steps: 8, strength: 0.7, image_size: portrait_4_3, enable_safety_checker: false }`
  - `VIDEO_IMAGE_TO_VIDEO`: Fal `fal-ai/wan-i2v` **(inactive placeholder)** — the row exists so admins see the slot; adapters throw `ModelNotConfiguredError` until `isActive` flips to TRUE
  - `EMBEDDING`: **not seeded** — added when the embedder ships

#### Drift note (indexes NOT modelled in schema.prisma)

Prisma initially wanted to `DROP INDEX` three raw-SQL indexes (`character_appearance_profiles_face_embedding_idx`, `characters_name_trgm_idx`, `characters_tags_gin_idx`) because they were created via raw SQL in the initial characters migration and Prisma can't express HNSW / `gin_trgm_ops`. Those `DROP INDEX` statements were removed from the generated migration to preserve discover-search + face-identity similarity. If schema drift warnings appear on future migrations they will target the same indexes — keep removing the DROPs.

#### Rollback
```sql
-- Drop new tables (children first)
DROP TABLE IF EXISTS "relationship_milestones" CASCADE;
DROP TABLE IF EXISTS "relationship_states" CASCADE;
DROP TABLE IF EXISTS "memory_facts" CASCADE;
DROP TABLE IF EXISTS "conversation_summaries" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "conversations" CASCADE;
DROP TABLE IF EXISTS "model_configs" CASCADE;

-- Drop the structuredFacts column from user_profiles
ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "structuredFacts";

-- Drop enums
DROP TYPE IF EXISTS "RelationshipTier";
DROP TYPE IF EXISTS "MemoryCategory";
DROP TYPE IF EXISTS "MessageStatus";
DROP TYPE IF EXISTS "MessageRole";
DROP TYPE IF EXISTS "ModelProvider";
DROP TYPE IF EXISTS "ModelPurpose";
```

---

### 20260728060000_seed_character_lookups

**Date:** 2026-07-28
**Author:** amorify agent
**Status:** Applied

#### Purpose
Seed the four character-creation lookup tables so the character-creation wizard has data on day one. Matches candy.ai's live options (screenshots captured 2026-07-28): 12 personality archetypes, 12 relationship archetypes, 28 occupations (with three flagged `isNsfwOnly`), and 9 voice presets (all bound to `MOCK_TTS` for now).

Every `INSERT` uses `ON CONFLICT (slug) DO UPDATE` so this migration is idempotent and can safely be re-run against a partially-seeded database (e.g. when we update prompt fragments or icons later).

#### Changes
- **New rows:**
  - `personality_archetypes` — 12 rows (`nympho`, `lover`, `submissive`, `dominant`, `temptress`, `innocent`, `caregiver`, `experimenter`, `mean`, `confidant`, `shy`, `queen`)
  - `relationship_archetypes` — 12 rows (`stranger`, `girlfriend`, `sex_friend`, `school_mate`, `work_colleague`, `wife`, `mistress`, `friend`, `step_sister`, `step_mom`, `boss`, `neighbor`)
  - `character_occupations` — 28 rows; 3 flagged `isNsfwOnly=TRUE` (`stripper`, `cam_girl`, `pornstar`)
  - `voice_presets` — 9 rows (`voice_01_confident` … `voice_09_whimsical`), all `provider = MOCK_TTS`

#### Rollback
```sql
DELETE FROM voice_presets           WHERE slug LIKE 'voice_0%';
DELETE FROM character_occupations   WHERE slug IN ('student','dancer','model','stripper','maid','cam_girl','boss_ceo','pornstar','streamer','bartender','tech_engineer','lifeguard','cashier','massage_therapist','teacher','nurse','secretary','yoga_instructor','fitness_coach','cook','waitress','photographer','journalist','doctor','lawyer','musician','artist','personal_trainer');
DELETE FROM relationship_archetypes WHERE slug IN ('stranger','girlfriend','sex_friend','school_mate','work_colleague','wife','mistress','friend','step_sister','step_mom','boss','neighbor');
DELETE FROM personality_archetypes  WHERE slug IN ('nympho','lover','submissive','dominant','temptress','innocent','caregiver','experimenter','mean','confidant','shy','queen');
```

---

### 20260728055047_add_characters

**Date:** 2026-07-28
**Author:** amorify agent
**Status:** Applied

#### Purpose
Adds the full character-creation schema: the `characters` table plus its supporting lookups (`personality_archetypes`, `relationship_archetypes`, `character_occupations`, `voice_presets`) and per-character children (`character_appearance_profiles`, `character_edit_history`). Supports the 15-step wizard captured in `.agents/docs/product-research.md` §2 and the two-tab preview screen (Appearance / Character) observed on candy.ai on 2026-07-28.

Data is separated into wizard answers, three compiled artifacts (`systemPrompt`, `appearancePrompt`, `bio`), a draft/active lifecycle, moderation state, and versioned appearance profiles that hold the face embedding for identity-locked image/video generation.

#### Changes

- **New tables:**
  - `characters` — wizard answers + compiled prompts + lifecycle
  - `character_appearance_profiles` — versioned per-character appearance descriptors + pgvector face embedding + face keypoints
  - `character_edit_history` — tier-scoped audit trail for post-create edits
  - `personality_archetypes` — 12-row lookup, admin-editable
  - `relationship_archetypes` — 12-row lookup, admin-editable
  - `character_occupations` — 28-row lookup, admin-editable, includes `isNsfwOnly`
  - `voice_presets` — 9-row lookup for the 9 candy.ai-style preset voices
- **New enums:** `BaseStyle`, `Ethnicity`, `Gender`, `EyeColor`, `HairStyle`, `HairColor`, `BodyType`, `SizeTier`, `CharacterStatus` (DRAFT/ACTIVE/ARCHIVED), `CharacterVisibility` (PRIVATE/UNLISTED/PUBLIC), `CharacterModerationStatus` (APPROVED/UNDER_REVIEW/BLOCKED), `VoiceProvider` (MOCK_TTS/ELEVENLABS/OPENAI_REALTIME/CARTESIA/PLAYHT), `ConstraintTier` (HARD/TEMPORAL/SOFT/EMERGENT).
- **Foreign keys / relations:**
  - `characters.ownerUserId → users.id` (CASCADE)
  - `characters.personalityArchetypeId → personality_archetypes.id` (RESTRICT)
  - `characters.relationshipArchetypeId → relationship_archetypes.id` (RESTRICT)
  - `characters.occupationId → character_occupations.id` (RESTRICT)
  - `characters.voicePresetId → voice_presets.id` (RESTRICT)
  - `character_appearance_profiles.characterId → characters.id` (CASCADE)
  - `character_edit_history.characterId → characters.id` (CASCADE)
  - `character_edit_history.editorUserId → users.id` (CASCADE)
- **CHECK constraints (domain invariants):**
  - `characters_age_18_plus_check`: `ageYears >= 18` (legal floor, product-research §9.1)
  - `characters_hobbies_max_3_check`: `array_length(hobbies, 1) <= 3`
  - `characters_tags_max_8_check`: `array_length(tags, 1) <= 8`
  - `characters_regeneration_count_max_2_check`: `regenerationCount BETWEEN 0 AND 2`
  - `characters_flirtation_range_check` / `patience` / `mood_volatility` / `dominance`: sliders `BETWEEN 0 AND 100`
  - `characters_committed_at_status_check`: `committedAt` is null iff `status = DRAFT`
  - `character_appearance_profiles_version_positive_check`: `version >= 1`
- **Indexes:**
  - Standard btree via Prisma on all FK columns + `(ownerUserId, status)`, `(visibility, moderationStatus)`, `featuredAt`
  - `characters_name_trgm_idx` — GIN + `extensions.gin_trgm_ops` for fuzzy name search
  - `characters_tagline_trgm_idx` — GIN + `extensions.gin_trgm_ops`, partial on `tagline IS NOT NULL`
  - `characters_tags_gin_idx` — GIN on `tags` text[] for faceted filtering
  - `character_appearance_profiles_face_embedding_idx` — **HNSW** + `extensions.vector_cosine_ops` on the 512-dim `vector` column (identity-lock similarity)
- **Row Level Security:** enabled on all 7 new tables with no policies attached (matches init migration convention — Prisma bypasses via `postgres` superuser).

#### Table Details

##### `characters`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NO | — | PK |
| ownerUserId | UUID | NO | — | FK → users.id (CASCADE) |
| name | TEXT | NO | — | Hard-tier identity, immutable post-commit |
| birthdate | DATE | NO | — | Hard-tier identity |
| baseStyle | BaseStyle | NO | — | REALISTIC / ANIME / THREE_D / CARTOON |
| ethnicity | Ethnicity | NO | — | 7 enum values |
| gender | Gender | NO | — | FEMALE / MALE / NONBINARY |
| ageYears | INT | NO | — | CHECK ≥ 18 |
| eyeColor | EyeColor | NO | — | 8 enum values |
| hairStyle | HairStyle | NO | — | 9 enum values |
| hairColor | HairColor | NO | — | 11 enum values (inc. FANTASY_OTHER) |
| bodyType | BodyType | NO | — | 6 enum values |
| bustSize / hipSize | SizeTier | YES | — | XS/S/M/L/XL |
| clothing | TEXT | YES | — | Outfit preset name |
| personalityArchetypeId | UUID | NO | — | FK RESTRICT |
| relationshipArchetypeId | UUID | NO | — | FK RESTRICT |
| occupationId | UUID | NO | — | FK RESTRICT |
| voicePresetId | UUID | NO | — | FK RESTRICT |
| flirtation / patience / moodVolatility / dominance | INT | NO | 50 | CHECK 0-100 |
| language | TEXT | NO | 'en' | ISO 639-1 |
| hobbies | TEXT[] | NO | `{}` | CHECK ≤ 3 |
| tags | TEXT[] | NO | `{}` | CHECK ≤ 8 |
| nsfwOptIn | BOOLEAN | NO | FALSE | Character-level opt-in |
| tagline | TEXT | YES | — | Short line for discover cards |
| backstory | TEXT | YES | — | Append-only via edit flow |
| systemPrompt | TEXT | NO | — | Compiled artifact |
| appearancePrompt | TEXT | NO | — | Compiled artifact |
| bio | TEXT | YES | — | Auto-generated character description |
| promptCompiledAt | TIMESTAMPTZ | NO | — | Timestamp of last prompt compilation |
| status | CharacterStatus | NO | 'DRAFT' | DRAFT/ACTIVE/ARCHIVED |
| regenerationCount | INT | NO | 0 | CHECK 0-2 (image regens during creation) |
| committedAt | TIMESTAMPTZ | YES | — | Set at DRAFT→ACTIVE transition |
| visibility | CharacterVisibility | NO | 'PRIVATE' | PRIVATE/UNLISTED/PUBLIC |
| moderationStatus | CharacterModerationStatus | NO | 'APPROVED' | APPROVED/UNDER_REVIEW/BLOCKED |
| featuredAt | TIMESTAMPTZ | YES | — | Non-null = featured on discover |
| createdAt / updatedAt | TIMESTAMPTZ | NO | now() / auto | |

**Indexes:** `characters_ownerUserId_idx`, `characters_ownerUserId_status_idx`, `characters_visibility_moderationStatus_idx`, `characters_featuredAt_idx`, `characters_name_trgm_idx` (gin_trgm), `characters_tagline_trgm_idx` (gin_trgm, partial), `characters_tags_gin_idx` (gin).

##### `character_appearance_profiles`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| characterId | UUID | FK CASCADE |
| version | INT | CHECK ≥ 1; unique per character |
| appearancePrompt | TEXT | Compiled visual descriptor |
| referenceImageR2Key | TEXT | Nullable; R2 object key |
| faceEmbedding | vector(512) | pgvector; Prisma-`Unsupported`, queried via raw SQL |
| faceKeypoints | JSONB | Locked facial keypoints for identity-lock |
| isActive | BOOLEAN | Only one active per character |
| createdAt | TIMESTAMPTZ | |

**Indexes:** `character_appearance_profiles_characterId_isActive_idx`, `character_appearance_profiles_characterId_version_key` (UNIQUE), `character_appearance_profiles_face_embedding_idx` (HNSW + vector_cosine_ops).

##### `character_edit_history`
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| characterId | UUID | FK CASCADE |
| editorUserId | UUID | FK CASCADE |
| tier | ConstraintTier | HARD/TEMPORAL/SOFT/EMERGENT |
| fieldName | TEXT | Field that changed |
| oldValue / newValue | JSONB | |
| reason | TEXT | Optional |
| createdAt | TIMESTAMPTZ | |

**Indexes:** `(characterId, createdAt)`, `editorUserId`.

#### Rollback
Full rollback drops the pgvector index and all seven tables (order matters — children first, then parent `characters`, then lookups):
```sql
DROP INDEX IF EXISTS character_appearance_profiles_face_embedding_idx;
DROP INDEX IF EXISTS characters_tags_gin_idx;
DROP INDEX IF EXISTS characters_tagline_trgm_idx;
DROP INDEX IF EXISTS characters_name_trgm_idx;
DROP TABLE IF EXISTS character_edit_history          CASCADE;
DROP TABLE IF EXISTS character_appearance_profiles   CASCADE;
DROP TABLE IF EXISTS characters                      CASCADE;
DROP TABLE IF EXISTS voice_presets                   CASCADE;
DROP TABLE IF EXISTS character_occupations           CASCADE;
DROP TABLE IF EXISTS relationship_archetypes         CASCADE;
DROP TABLE IF EXISTS personality_archetypes          CASCADE;
DROP TYPE  IF EXISTS "ConstraintTier";
DROP TYPE  IF EXISTS "VoiceProvider";
DROP TYPE  IF EXISTS "CharacterModerationStatus";
DROP TYPE  IF EXISTS "CharacterVisibility";
DROP TYPE  IF EXISTS "CharacterStatus";
DROP TYPE  IF EXISTS "SizeTier";
DROP TYPE  IF EXISTS "BodyType";
DROP TYPE  IF EXISTS "HairColor";
DROP TYPE  IF EXISTS "HairStyle";
DROP TYPE  IF EXISTS "EyeColor";
DROP TYPE  IF EXISTS "Gender";
DROP TYPE  IF EXISTS "Ethnicity";
DROP TYPE  IF EXISTS "BaseStyle";
```

---

### 20260727100247_init

**Date:** 2026-07-27
**Author:** amorify agent
**Status:** Applied

#### Purpose
Bootstrap the database: install Postgres extensions the memory / search layers require, create the auth + profile tables, and enable Row Level Security across everything (Supabase defense-in-depth).

#### Changes
- **Extensions (schema `extensions`):** `vector` (pgvector), `pg_trgm`, `pgcrypto`, `unaccent`. All installed via `CREATE EXTENSION ... WITH SCHEMA extensions` to avoid the Supabase `0014_extension_in_public` advisor warning.
- **New enums:** `UserRole` (USER/ADMIN/MODERATOR), `UserStatus` (ACTIVE/SUSPENDED/PENDING_VERIFICATION).
- **New tables:** `users`, `accounts`, `sessions`, `verification_tokens`, `user_profiles` — NextAuth-compatible schema with age-gate & compliance columns on `users`.
- **Foreign keys:** `accounts.userId`, `sessions.userId`, `user_profiles.userId` → `users.id` (ON DELETE CASCADE).
- **Row Level Security:** enabled on all five tables with no policies attached (deny by default for the anon/authenticated roles).

#### Rollback
```sql
DROP TABLE IF EXISTS user_profiles       CASCADE;
DROP TABLE IF EXISTS verification_tokens CASCADE;
DROP TABLE IF EXISTS sessions            CASCADE;
DROP TABLE IF EXISTS accounts            CASCADE;
DROP TABLE IF EXISTS users               CASCADE;
DROP TYPE  IF EXISTS "UserStatus";
DROP TYPE  IF EXISTS "UserRole";
-- Extensions are shared infrastructure; leaving them in place is intentional.
```

---

## Current Schema State

| Object | Count |
|---|---|
| Tables | 12 |
| Enums | 14 |
| Indexes | ~35 (btree + trigram GIN + array GIN + HNSW) |
| Foreign keys | 10 |
| CHECK constraints | 9 (all on `characters` + 1 on `character_appearance_profiles`) |
| Extensions | 4 (`vector`, `pg_trgm`, `pgcrypto`, `unaccent`, all in schema `extensions`) |
| RLS-enabled tables | 12 / 12 |

---

## Change Policy

1. **Never edit an applied migration.** Create a new migration to correct mistakes.
2. **Every `prisma migrate dev --name <x>` MUST be followed by an update to this file** in the same commit.
3. Include enough detail that another engineer can understand the intent and safely operate the database without opening the SQL.
4. If a migration is destructive (dropping columns/tables, changing types with data loss risk), explicitly call it out under a **Breaking changes** subsection.
5. Seed data changes belong here too if they materially affect app behavior (e.g. default roles, pricing rules).
