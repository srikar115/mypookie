-- Gender presentation of the voice (Cartesia vocabulary:
-- feminine | masculine | gender_neutral). Nullable — legacy rows are
-- backfilled by scripts/import-cartesia-voices.mjs.
ALTER TABLE "voice_presets" ADD COLUMN "gender" TEXT;
