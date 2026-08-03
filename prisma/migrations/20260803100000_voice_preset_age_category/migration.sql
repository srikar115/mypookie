-- Age group ("young" | "mature", null = unknown/any) and category
-- ("conversational" | "support" | "narration" | "advertising", null =
-- unclassified) — both heuristically derived from the Cartesia voice
-- description at import time, since the public /voices API exposes
-- neither field. See scripts/import-cartesia-voices.mjs.
ALTER TABLE "voice_presets" ADD COLUMN "ageGroup" TEXT;
ALTER TABLE "voice_presets" ADD COLUMN "category" TEXT;
