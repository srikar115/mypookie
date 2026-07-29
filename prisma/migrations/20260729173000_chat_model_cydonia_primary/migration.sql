-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — swap CHAT primary to Cydonia, keep Euryale as fallback        │
-- │                                                                          │
-- │ Rationale: `minimax/minimax-m2-her` (set in the previous migration)     │
-- │ has stricter safety training and isn't a good fit for the NSFW-capable  │
-- │ roleplay this app supports. Switching to `thedrummer/cydonia-24b-v4.1`  │
-- │ — a 24B mistral-based RP fine-tune that's known-permissive and fast    │
-- │ enough for real-time chat — as the primary.                             │
-- │                                                                          │
-- │ `sao10k/l3.3-euryale-70b` becomes the OpenRouter-side fallback. It's   │
-- │ what we were on before; keeping it in the chain means if Cydonia's     │
-- │ upstream provider blips we automatically route to Euryale without any  │
-- │ code change.                                                             │
-- │                                                                          │
-- │ Two layers of resilience still apply (unchanged from prior migration): │
-- │   1. OpenRouter's `models` array — automatic fallback INSIDE OpenRouter │
-- │      before we ever see an error.                                       │
-- │   2. Our own retry loop in stream/route.ts — retries the entire        │
-- │      request up to 3× if OpenRouter still fails after its own chain.   │
-- └─────────────────────────────────────────────────────────────────────────┘

UPDATE "model_configs"
   SET "modelId" = 'thedrummer/cydonia-24b-v4.1',
       "parameters" = jsonb_build_object(
         'temperature', 0.8,
         'top_p', 0.95,
         'max_tokens', 800,
         -- Fallback chain — OpenRouter walks left-to-right on any 4xx/5xx
         -- from an upstream provider. `models[0]` mirrors the top-level
         -- `model` field so the whole request stays consistent.
         'models', jsonb_build_array(
           'thedrummer/cydonia-24b-v4.1',
           'sao10k/l3.3-euryale-70b'
         )
       ),
       "updatedAt" = NOW()
 WHERE "purpose" = 'CHAT';
