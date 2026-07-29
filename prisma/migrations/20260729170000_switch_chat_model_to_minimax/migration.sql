-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — switch CHAT model to minimax-m2-her with cydonia fallback     │
-- │                                                                          │
-- │ Motivation: `sao10k/l3.3-euryale-70b` has been hitting 429/502 through  │
-- │ its narrow set of provider backends (see .next/dev/logs). Swapping to  │
-- │ `minimax/minimax-m2-her` (faster / cheaper / more stable routing) as   │
-- │ the primary, with `thedrummer/cydonia-24b-v4.1` as the automatic       │
-- │ OpenRouter-side fallback via the `models: [...]` request param.        │
-- │                                                                          │
-- │ Two layers of resilience combine here:                                   │
-- │   1. OpenRouter's `models` fallback chain — if primary fails inside     │
-- │      OpenRouter, they route to the next model in the array before      │
-- │      responding to us. Transparent to our code.                         │
-- │   2. Our own retry loop in stream/route.ts — if OpenRouter still 5xxs   │
-- │      after exhausting its own fallback chain, we retry the entire      │
-- │      request up to 3× with backoff.                                    │
-- └─────────────────────────────────────────────────────────────────────────┘

UPDATE "model_configs"
   SET "modelId" = 'minimax/minimax-m2-her',
       "parameters" = jsonb_build_object(
         'temperature', 0.8,
         'top_p', 0.95,
         'max_tokens', 800,
         -- Fallback chain: OpenRouter tries these left-to-right on any
         -- upstream error. The primary is repeated as models[0] so the
         -- explicit `model` field stays consistent with the chain.
         'models', jsonb_build_array(
           'minimax/minimax-m2-her',
           'thedrummer/cydonia-24b-v4.1'
         )
       ),
       "updatedAt" = NOW()
 WHERE "purpose" = 'CHAT';
