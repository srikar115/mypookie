-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — trim CHAT max_tokens from 800 → 400                           │
-- │                                                                          │
-- │ Rationale: 800 gave Cydonia enough headroom to produce 4-6 sentence     │
-- │ paragraphs on every turn, which users reported as "tiring to read" in  │
-- │ a companion app. 400 tokens comfortably fits the new prompt directive  │
-- │ (1-3 sentences avg, up to 4 for big emotional beats) while still       │
-- │ leaving room for a rich reply during rare longer moments.               │
-- │                                                                          │
-- │ Token math: ~4 chars per English token; 3 sentences × ~120 chars ≈     │
-- │ 90 tokens typical. 400 leaves ~4x headroom before the hard cap bites, │
-- │ so the model rarely gets truncated mid-sentence.                        │
-- │                                                                          │
-- │ Prompt-side length guidance lives in template-prompt-composer.ts       │
-- │ (RESPONSE STYLE block) and is applied every turn. The two work         │
-- │ together — prompt tunes voluntary length, max_tokens is the guardrail. │
-- └─────────────────────────────────────────────────────────────────────────┘

UPDATE "model_configs"
   SET "parameters" = jsonb_set(
         "parameters",
         '{max_tokens}',
         to_jsonb(400::int),
         false
       ),
       "updatedAt" = NOW()
 WHERE "purpose" = 'CHAT';
