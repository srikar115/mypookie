-- ============================================================
-- Migration: 20260803120100_seed_chat_media_model_configs
--
-- Seeds one model_configs row per in-chat generation purpose. Split out from
-- 20260803120000_chat_media_generation because Postgres refuses to use a new
-- enum value inside the same transaction that added it ("unsafe use of new
-- value ... of enum type"). By the time this migration runs the four
-- CHAT_* ModelPurpose values are committed.
--
-- Idempotent via ON CONFLICT ("purpose") — model_configs.purpose is UNIQUE, so
-- re-running this updates the row in place rather than erroring.
--
-- `updatedAt` is passed explicitly: it is NOT NULL with no database default
-- (Prisma's @updatedAt is applied client-side, not by Postgres).
-- ============================================================

-- ── Wan 2.7 edit — active default for chat image generation ─────────────────
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'CHAT_IMAGE_EDIT',
    'FAL',
    'fal-ai/wan/v2.7/edit',
    NULL,
    '{"aspect_ratio": "1:1", "enable_safety_checker": false, "enable_prompt_expansion": false}'::jsonb,
    'Wan 2.7 Edit — chat image (reference-consistent)',
    'Default model for in-chat image generation. Takes image_urls[0] as the character reference so successive photos stay consistent. When no reference image can be resolved, RunMediaGenerationUseCase swaps to the CHAT_IMAGE_TEXT_TO_IMAGE sibling.',
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

-- ── Wan 2.7 text-to-image — active fallback when no reference exists ────────
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'CHAT_IMAGE_TEXT_TO_IMAGE',
    'FAL',
    'fal-ai/wan/v2.7/text-to-image',
    NULL,
    '{"aspect_ratio": "1:1", "enable_safety_checker": false, "enable_prompt_expansion": false}'::jsonb,
    'Wan 2.7 T2I — chat image fallback',
    'Used when the companion has no avatar and no prior chat image, so there is nothing to edit from. The prompt builder compensates by expanding the full appearance description.',
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

-- ── Wan 2.7 text-to-video — inactive placeholder ───────────────────────────
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'CHAT_VIDEO_TEXT_TO_VIDEO',
    'FAL',
    'fal-ai/wan/v2.7/text-to-video',
    NULL,
    '{"aspect_ratio": "9:16", "duration": 5, "resolution": "720p", "enable_safety_checker": false, "enable_prompt_expansion": false}'::jsonb,
    'Wan 2.7 T2V — chat video',
    'Seeded inactive. Chat video ships behind NEXT_PUBLIC_CHAT_VIDEO_ENABLED; flip isActive once the 50-credit price point and the 5 minute queue timeout have been load-tested.',
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

-- ── Seedance 1.5 Pro image-to-video — inactive placeholder ─────────────────
INSERT INTO "model_configs"
  ("id", "purpose", "provider", "modelId", "endpoint", "parameters", "label", "notes", "isActive", "updatedByUserId", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'CHAT_VIDEO_IMAGE_TO_VIDEO',
    'FAL',
    'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    NULL,
    '{"aspect_ratio": "9:16", "duration": 5, "resolution": "720p"}'::jsonb,
    'Seedance 1.5 Pro I2V — chat video',
    'Seeded inactive. Seedance rejects enable_safety_checker / enable_prompt_expansion, so the payload builder omits both for this slug.',
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
