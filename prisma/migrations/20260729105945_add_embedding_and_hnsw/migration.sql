-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — enable semantic memory retrieval                              │
-- │                                                                          │
-- │ Turns on the deferred half of the memory retrieval design:              │
-- │   1. Adds an `EMBEDDING` row to `model_configs` so the embedder         │
-- │      resolves its model at runtime (like every other LLM in the app).   │
-- │   2. Adds a `USING hnsw` cosine index on `memory_facts.embedding`.      │
-- │                                                                          │
-- │ The column itself was added in                                          │
-- │ `20260728120642_add_chat_memory_and_model_config`; this migration only  │
-- │ enables it. Existing rows have `embedding IS NULL` and won't participate │
-- │ in semantic retrieval until the embedder writes to them. Retrieval      │
-- │ gracefully falls back to lexical + entity + recency for those rows.     │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── 1. Seed the EMBEDDING model config row ────────────────────────────────
--
-- OpenAI text-embedding-3-small at dimensions=1024 (Matryoshka truncation
-- to fit our vector(1024) column). Provider is OPENAI so the adapter picks
-- the OpenAIEmbeddingLlm code path. Endpoint uses OpenAI's default so
-- swapping to a compatible provider (Together, DeepInfra) is a
-- {endpoint, modelId, dimensions} tuple update — no code change.
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'EMBEDDING',
    'OPENAI',
    'text-embedding-3-small',
    'https://api.openai.com/v1',
    '{"dimensions": 1024}'::jsonb,
    'OpenAI text-embedding-3-small — memory retrieval',
    'Vectorizes memory_facts.content + query text for semantic recall. Truncated to 1024 dims via Matryoshka to fit the pgvector column. Swap to text-embedding-3-large (dim 3072) requires a column widen + re-embed.',
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

-- ── 2. HNSW index for cosine similarity retrieval ─────────────────────────
--
-- HNSW (Hierarchical Navigable Small World) is preferred over IVFFlat at
-- our scale (<1M rows): no training step, better recall/latency tradeoff,
-- graceful degradation as the corpus grows.
--
-- Operator class is `vector_cosine_ops` (matches OpenAI's normalization
-- convention). The <=> operator returns cosine DISTANCE ∈ [0, 2]; we
-- convert to similarity ∈ [-1, 1] as `1 - distance` in the searcher SQL.
--
-- IF NOT EXISTS is defensive — a fresh dev DB won't have this yet, but a
-- Supabase project with the HNSW alpha pre-flag could.
CREATE INDEX IF NOT EXISTS "memory_facts_embedding_hnsw_idx"
  ON "memory_facts"
  USING hnsw ("embedding" extensions.vector_cosine_ops);
