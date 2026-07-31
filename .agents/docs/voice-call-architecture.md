# Voice Call Architecture — Amorify

> Full landscape analysis and finalized stack for the real-time voice-call feature (Candy.ai-parity).
> Compiled 2026-07-30 from provider docs (Cartesia, Deepgram, LiveKit, OpenRouter, ElevenLabs, OpenAI Realtime), Candy AI's public architecture diagram, and real-world latency measurements against our current text-chat stack.

---

## Table of Contents

1. [Feature intent](#1-feature-intent)
2. [Architectural choice: cascaded vs end-to-end](#2-architectural-choice-cascaded-vs-end-to-end)
3. [STT — streaming speech-to-text providers](#3-stt--streaming-speech-to-text-providers)
4. [LLM — RP-capable, NSFW-permissive, 70B tier](#4-llm--rp-capable-nsfw-permissive-70b-tier)
5. [TTS — streaming, expressive text-to-speech](#5-tts--streaming-expressive-text-to-speech)
6. [Transport / real-time infrastructure](#6-transport--real-time-infrastructure)
7. [End-to-end stack comparison](#7-end-to-end-stack-comparison)
8. [Latency budget breakdown](#8-latency-budget-breakdown)
9. [Finalized stack](#9-finalized-stack)
9a. [Selected configuration (as-implemented)](#9a-selected-configuration-as-implemented)
10. [Memory transfer from chat to voice](#10-memory-transfer-from-chat-to-voice)
11. [Turn-taking state machine](#11-turn-taking-state-machine)
12. [Schema deltas](#12-schema-deltas)
13. [Prompt composition sample](#13-prompt-composition-sample)
14. [Implementation phases](#14-implementation-phases)
15. [Cost model](#15-cost-model)
16. [Latency-hiding tricks](#16-latency-hiding-tricks)
17. [Deferred / future evaluations](#17-deferred--future-evaluations)

---

## 1. Feature intent

Real-time voice calls between a user and their AI companion, matching Candy AI's UX:

- Tap the phone icon in the chat header → browser prompts for microphone → call starts.
- Character shows "Listening / Thinking / Speaking" state pill.
- User speaks, character replies with streaming synthesized voice — feels "instant" (sub-second perceived latency).
- Voice call turns land in the **same conversation record** as text chat, so the transcript is naturally continuous when the user closes the call and returns to typing.
- Character carries the same personality, memory, and relationship state from chat into the call.
- Full turn transcripts persist so the memory pipeline can extract facts from spoken conversations too.

---

## 2. Architectural choice: cascaded vs end-to-end

Two families of voice-agent architecture exist today:

### 2a. Cascaded pipeline (chosen)

```
Browser mic → WebRTC audio → STT (streaming) → transcript
                                                    ↓
                                            existing memory + LLM pipeline
                                                    ↓
                                            streaming text tokens
                                                    ↓
                                            TTS (streaming) → audio back to browser
```

Three independent stages orchestrated by an agent process. Each stage streams to minimise turn latency.

### 2b. End-to-end voice-to-voice (rejected for now)

A single provider consumes user audio, reasons over it, and emits response audio in one HTTP/WebSocket connection. Examples: OpenAI Realtime API, ElevenLabs Conversational AI, Ultravox, Vapi.ai, Cartesia Line.

### 2c. Decision matrix

| Concern | Cascaded (chosen) | End-to-end |
|---|---|---|
| Character personality consistency | LLM = same Euryale that drives chat → identical voice across text and voice | Provider locks LLM (GPT-4o for Realtime API, etc.) → different personality than chat |
| NSFW-capable | ✅ Euryale is uncensored | ❌ Realtime API refuses adult content; ElevenLabs Conv AI passes through but restricted |
| Reuse memory system | ✅ Memory block, retrieved facts, relationship state, summaries all flow through unchanged | ❌ Would need major rework or fork |
| Cost per minute | ~$0.045 | ~$0.24 (Realtime) to ~$0.35 (ElevenLabs) |
| Latency (perceived first audio) | 500–1000 ms | 300–500 ms |
| Vendor lock-in | None — any of 3 layers swappable | Deep |
| Barge-in / interruption | Fully controllable via LiveKit + Cartesia flags | Provider-dependent, often opaque |

**Verdict:** cascaded. We trade ~200-500 ms of extra latency for full control, our Euryale personality, and NSFW capability — non-negotiable for a companion app.

---

## 3. STT — streaming speech-to-text providers

Endpointing latency = time from user's last spoken syllable to the STT emitting an `is_final` event. This is the dominant STT contribution to perceived turn latency.

| Provider | Model | Endpointing (final) | $/min | NSFW-safe? | Notes |
|---|---|---|---|---|---|
| **Cartesia** | **Ink-2** | **100–200 ms** | $0.006 | ✅ | Colocated with Sonic TTS — one less cross-provider hop. Used by Candy AI. |
| **Deepgram** | **Nova-3** | 100–300 ms | $0.0058 | ✅ | Industry-best WER on accented and noisy audio. |
| Deepgram | Nova-2 | 150–350 ms | $0.0043 | ✅ | Older, cheaper. |
| Groq | Whisper-v3-turbo | 100–200 ms (batch chunks) | $0.0018 | ✅ | Ultra-fast batch — requires client-side VAD to chunk; harder engineering. |
| Fireworks | Whisper-v3-turbo | 150–250 ms | $0.0015 | ✅ | Same batch caveat. |
| AssemblyAI | Universal-Streaming | 200–400 ms | $0.0025 | ✅ | Cheap; slower endpointing. |
| Speechmatics | Realtime v2 | 400–800 ms | $0.020 | ✅ | Best accent handling but too slow for our target. |
| Google Cloud | Speech-to-Text v2 | 200–500 ms | $0.006 | ✅ | Solid, no edge. |
| Azure | Speech Service | 200–400 ms | $0.017 | ⚠️ | Enterprise NSFW policy risk. |
| Rev AI | Streaming | 300–600 ms | $0.020 | ✅ | Overpriced. |
| AWS Transcribe | — | 300–500 ms | $0.024 | ✅ | Slow and expensive; skip. |
| OpenAI | whisper-1 | Batch only | $0.006 | ✅ | Not streaming — skip. |

**Winner:** Cartesia Ink-2 for same-vendor colocation with the TTS. Deepgram Nova-3 as documented fallback (feature-flagged behind a `SpeechToTextPort` swap).

---

## 4. LLM — RP-capable, NSFW-permissive, 70B tier

First-token latency measured with ~800-token context (memory block + short history), streaming enabled.

| Provider | Model | First-token | $/1M in / out | NSFW? | Notes |
|---|---|---|---|---|---|
| **OpenRouter `:nitro`** | **`sao10k/l3.1-euryale-70b:nitro`** | **250–500 ms** | ~$0.80 / $1.00 | ✅ | Auto-routes to lowest-latency provider serving that model right now. |
| OpenRouter | `sao10k/l3.1-euryale-70b` | 400–800 ms | $0.65 / $0.75 | ✅ | Default routing — variable provider. |
| OpenRouter `:nitro` | `sao10k/l3.3-euryale-70b:nitro` | 250–500 ms | ~$0.80 / $1.00 | ✅ | Fallback candidate. |
| Featherless | `l3.1-euryale-70b` direct | 300–600 ms | $1.00 / $2.00 | ✅ | Alternative direct hosting. |
| DeepInfra | `l3.1-euryale-70b` direct | 300–500 ms | $0.90 / $0.90 | ✅ | Alternative direct hosting. |
| OpenRouter | `thedrummer/cydonia-24b-v4.1` | 200–400 ms | $0.20 / $0.30 | Partial | Faster but weaker RP; kept as tertiary fallback. |
| Groq | `llama-3.3-70b` (base) | 100–200 ms | $0.59 / $0.79 | ❌ | Refuses adult content — disqualified. |
| Cerebras | `llama-3.3-70b` | 150–250 ms | $0.60 / $0.90 | ❌ | Same refusal. |
| SambaNova | `llama-3.3-70b` | 100–300 ms | Custom | ❌ | Same refusal. |

**Winner:** `sao10k/l3.1-euryale-70b:nitro` primary, `sao10k/l3.3-euryale-70b:nitro` fallback — mirrors the diagram Candy publishes and gets a free 200-300 ms latency win over default routing.

---

## 5. TTS — streaming, expressive text-to-speech

First audio byte = time from the TTS receiving text to the first audio sample arriving on our wire. This is small compared to STT and LLM but stacks up on every turn.

| Provider | Model | First audio byte | $/min speaking | Emotional quality | Voice cloning |
|---|---|---|---|---|---|
| **Cartesia** | **Sonic-3.5** | **40–100 ms** | $0.017 | Excellent — inline `[laugh]` / `[sigh]` / `[whisper]` markers | ✅ |
| Cartesia | Sonic-2 | 40–90 ms | $0.015 | Very good | ✅ |
| LMNT | Streaming | 100–200 ms | $0.008 | Good | ✅ |
| PlayHT | Play3.0-mini | 200–400 ms | $0.008 | Good | ✅ |
| ElevenLabs | Flash v2.5 | 150–300 ms | $0.15/1000 chars ≈ $0.30/min | Very good | ✅ |
| ElevenLabs | Turbo v2.5 | 300–500 ms | $0.30/1000 chars ≈ $0.60/min | Best expressive | ✅ |
| ElevenLabs | v3 (alpha) | 400–800 ms | $0.50/1000 chars | Best-in-class | ✅ |
| Deepgram | Aura-2 | 200–400 ms | $0.0135 | Flat, robotic | ❌ |
| Resemble AI | Rapid v2 | 300–500 ms | $0.006 | Fair | ✅ |
| Azure Neural TTS | Neural HD | 400–800 ms | $0.16/1000 chars | Very good | ✅ |
| Google Cloud | Neural2 | 400–600 ms | $0.016 | Good | ❌ |
| OpenAI | tts-1 | 300–800 ms | $0.015/1000 chars | Fair | ❌ |
| OpenAI | tts-1-hd | 500–1200 ms | $0.030/1000 chars | Better | ❌ |
| Kokoro (self-hosted 82M) | — | 30–50 ms | Compute only | Fair | ❌ |

**Winner:** Cartesia Sonic-3.5 — sub-100 ms first byte, expressive, inline emotion markers, voice cloning if we ever want per-character branded voices. ElevenLabs Flash reserved as a premium-tier upsell for users who complain about voice quality.

---

## 6. Transport / real-time infrastructure

Client-server audio latency = round-trip time for audio packets between the browser and the STT/TTS pipeline. WebRTC edge PoPs matter enormously for mobile users on cellular networks; a central WebSocket relay in one region can add 200+ ms on the wrong continent.

| Provider | Type | Audio latency | $/min | Notes |
|---|---|---|---|---|
| **LiveKit Cloud** | WebRTC SFU + edge | **20–80 ms** | Free 10k min/mo, then $0.005 | Best DX; `livekit-agents` framework matches our cascade natively |
| LiveKit self-hosted | WebRTC SFU | 20–80 ms | Infra only | Free but ops overhead |
| Daily.co | WebRTC SFU | 30–100 ms | $0.004 | Enterprise features |
| Agora | WebRTC SFU | 30–80 ms | $0.99/1000 min | Reliable, less DX polish |
| Cartesia Line | WebSocket bundle | 100–200 ms | Bundled with Ink+Sonic | New end-to-end Cartesia stack (Ink + LLM proxy + Sonic in one API) |
| OpenAI Realtime API | WebRTC direct | 200–400 ms | $6/hr in + $24/hr out | GPT-4o only — no Euryale, no NSFW |
| ElevenLabs Conversational AI | WebSocket | 300–500 ms | Bundled | Custom LLM slot available but no composition control |
| Ultravox | WebSocket | 300–500 ms | $0.05 | OSS-adjacent alternative to Realtime |
| Vapi.ai | Managed platform | 300–700 ms | $0.05–0.10 | Turnkey but opinionated |
| Twilio Programmable Voice | WebRTC + SIP | 50–150 ms | $0.004 + per-user fees | Overkill unless we add phone-line calls |
| Custom WebSocket relay | WS | 50–200 ms | Bandwidth only | Cheapest, worst on mobile |

**Winner:** LiveKit Cloud. The edge PoPs are the reason Candy AI feels instant on mobile — cellular RTTs to a central server would kill perceived latency.

Also, Next.js App Router doesn't natively host long-lived WebSocket handlers. A LiveKit Agent runs as a separate Node worker that joins each call's "room" as an audio publisher. This is the standard architecture and avoids the "why is my WebSocket connection dropping every 30 seconds" class of bugs.

---

## 7. End-to-end stack comparison

All combinations listed here assume LiveKit Cloud transport unless noted. "Total latency" = time from user stopping speech to the first audible sample of the character's reply.

| Stack | STT | LLM | TTS | Total latency | $/min | NSFW | Verdict |
|---|---|---|---|---|---|---|---|
| **S1: Candy-exact** | **Cartesia Ink-2** | **Euryale `:nitro`** | **Cartesia Sonic-3.5** | **500–800 ms** | **~$0.045** | ✅ | **Chosen.** Single-vendor voice, matches Candy diagram. |
| S2: Best-of-breed | Deepgram Nova-3 | Euryale `:nitro` | Cartesia Sonic-3.5 | 600–900 ms | ~$0.046 | ✅ | Deepgram accuracy > Cartesia STT on accented/noisy audio. Kept as feature-flagged fallback. |
| S3: Cost-optimized | AssemblyAI | Euryale (default) | LMNT Streaming | 900–1300 ms | ~$0.023 | ✅ | Half the cost; feels laggy — rejected. |
| S4: Ultra-cheap | Groq Whisper | Cydonia-24B | Deepgram Aura-2 | 500–800 ms | ~$0.012 | Partial | Cydonia RP quality drop-off + Aura sounds robotic — rejected. |
| S5: Premium expressive | Cartesia Ink | Euryale `:nitro` | ElevenLabs Flash v2.5 | 700–1000 ms | ~$0.35 | ✅ | Reserved for future premium tier. |
| S6: OpenAI Realtime | Bundled | GPT-4o | Bundled | 300–500 ms | ~$0.50 | ❌ | Fastest but no NSFW, no Euryale — disqualified. |
| S7: ElevenLabs Convo AI | Bundled | Any (proxy) | ElevenLabs | 400–700 ms | ~$0.35 | ⚠️ | We lose our composition layer — rejected. |
| S8: Cartesia Line | Bundled | Any (proxy) | Cartesia Sonic | 400–600 ms | ~$0.05 | ✅ | Very promising; monitor for GA. Could collapse three integrations to one. |

---

## 8. Latency budget breakdown

For the chosen stack (S1), here's where each millisecond goes:

```
User stops speaking
     │
     │  100–200 ms   Cartesia Ink-2 finalizes utterance
     ↓
STT `is_final` event
     │
     │  20–40 ms     WebRTC → LiveKit edge → our agent
     ↓
Context build (memory block, cached in-process)
     │
     │  50–100 ms    Prisma reads + TemplateVoicePromptComposer
     ↓
LLM call
     │
     │  250–500 ms   Euryale :nitro first-token
     ↓
LLM streams tokens
     │
     │  40–100 ms    Cartesia Sonic first audio byte on first sentence
     ↓
Audio streams to LiveKit
     │
     │  40–80 ms     LiveKit edge → user browser
     ↓
User hears voice          ← 500–1020 ms total
```

Two overlaps hide additional latency:

- **LLM streams into TTS mid-generation.** As soon as the LLM has emitted the first sentence's closing punctuation, Cartesia can start synthesizing that sentence while the LLM is still generating the next one.
- **STT partials update the UI early.** The "Listening → Thinking" state pill flips the moment Cartesia emits an interim transcript, ~150 ms before `is_final`. Users feel responded-to well before actual audio starts.

---

## 9. Finalized stack

| Layer | Choice | Fallback |
|---|---|---|
| Transport | **LiveKit Cloud** (edge routing) | LiveKit self-hosted if we scale past their free tier economics |
| STT | **Deepgram Nova-3** (best-of-breed) | Cartesia Ink-2 (feature-flagged via `SpeechToTextPort`) |
| LLM | **`sao10k/l3.1-euryale-70b:nitro`** on OpenRouter | `sao10k/l3.3-euryale-70b:nitro` (already in OpenRouter fallback array) |
| TTS | **Cartesia Sonic-3.5** | ElevenLabs Flash v2.5 for premium tier |
| Prompt composition | New `TemplateVoicePromptComposer` (sibling of the chat composer) | — |

Rationale summary:

- Deepgram Nova-3 chosen over Cartesia Ink-2 for measurably better WER on accented and noisy audio — companion-app users call from trains, cars, bedrooms with fans running. Accuracy > 50 ms of same-vendor colocation savings.
- `:nitro` LLM routing is a free ~200-300 ms win over default OpenRouter routing.
- Cartesia Sonic-3.5 stays — sub-100 ms first byte and inline paralinguistic markers are unmatched.
- Total unit cost ~$0.046/min → 11× markup at 5 credits/min pricing.
- All three layers swappable via ports — no vendor lock-in.

---

## 9a. Selected configuration (as-implemented)

The exact values that ship with the code. Model IDs and provider params live in the `model_configs` table (admin-tunable at runtime); credentials and transport URLs live in `.env` (deploy-time only). Seed script: [scripts/seed-voice-model-configs.mjs](../../scripts/seed-voice-model-configs.mjs).

### 9a.1 Transport — LiveKit Cloud

**Env** (in both `E:\mypookie\.env` and `E:\mypookie-livekit\.env`):

| Key | Purpose | Example |
|---|---|---|
| `LIVEKIT_URL` | WebSocket URL of your LiveKit Cloud project | `wss://amorify-abc123.livekit.cloud` |
| `LIVEKIT_API_KEY` | Server-side API key (mints access tokens) | `APIabc…` |
| `LIVEKIT_API_SECRET` | Server-side secret (HMAC-signs LiveKit's own webhooks) | `secret_abc…` |
| `LIVEKIT_AGENT_URL` | Private URL of the agent worker (webhook fan-out) | `https://agent.internal:7880` |
| `LIVEKIT_WEBHOOK_KEY` | Shared HMAC secret between web app ↔ agent worker (**must match**) | random 32-byte hex |

**Access-token grants** minted at `POST /api/chat/[id]/call/token`:

```typescript
{
  roomJoin:        true,
  room:            `call_<sessionId>`,        // deterministic; agent derives from session id
  canPublish:      true,                       // user's mic
  canSubscribe:    true,                       // character's TTS audio
  canPublishData:  true,                       // barge-in / status data channel
}
ttl: 900 seconds  // 15-minute call ceiling before the token needs re-mint
```

**Room lifecycle** — LiveKit auto-deletes the room ~5 min after all participants leave. `POST /api/webhooks/livekit` receives `room_finished` and `participant_disconnected` events (signed via LiveKit's own SDK verifier) as a fallback for when the client fails to call `/call/end` cleanly (tab close, network drop).

### 9a.2 STT — Deepgram Nova-3

**Env** (agent worker only): `DEEPGRAM_API_KEY`

**`model_configs` row** (purpose = `VOICE_STT`):

```json
{
  "provider": "DEEPGRAM",
  "modelId":  "nova-3",
  "endpoint": "wss://api.deepgram.com/v1/listen",
  "parameters": {
    "model":            "nova-3",
    "language":         "multi",
    "endpointing":      200,
    "utterance_end_ms": 1000,
    "interim_results":  true,
    "smart_format":     true,
    "numerals":         true,
    "punctuate":        true,
    "vad_events":       true,
    "encoding":         "linear16",
    "sample_rate":      16000
  }
}
```

**Why these values:**

- `endpointing=200` — the single most important knob for perceived turn snappiness. Deepgram emits the `is_final` transcript 200 ms after the user stops speaking. Lowering it further causes premature cutoffs on hesitations ("I was thinking…"); raising it makes the character feel slow to respond.
- `utterance_end_ms=1000` — hard timeout if endpointing fails to trigger. Guarantees we don't hang waiting for silence detection.
- `interim_results=true` — streams partial transcripts so we can flip the "Thinking" state pill ~150 ms before `is_final`, hiding LLM tail latency (see §16b).
- `smart_format=true` + `punctuate=true` + `numerals=true` — formats "twenty three" → "23", "at three pm" → "at 3 PM". Improves memory-extraction downstream ("my birthday is October 3rd" gets stored as a proper date fact).
- `language=multi` — Nova-3 auto-detects and transcribes 10 languages including Hindi, Spanish, Japanese, Portuguese without needing to know the user's locale up front.
- `encoding=linear16 sample_rate=16000` — 16 kHz PCM matches Cartesia's default and keeps the audio pipeline sample-rate-consistent end to end.

### 9a.3 LLM — `sao10k/l3.1-euryale-70b:nitro`

**Env** (agent worker + web app): `OPENROUTER_API_KEY`

**`model_configs` row** (purpose = `VOICE_LLM`) — separate row from `CHAT` so admins can point voice at `:nitro` without disturbing text-chat routing:

```json
{
  "provider": "OPENROUTER",
  "modelId":  "sao10k/l3.1-euryale-70b:nitro",
  "endpoint": "https://openrouter.ai/api/v1/chat/completions",
  "parameters": {
    "temperature":       0.85,
    "top_p":             0.95,
    "max_tokens":        200,
    "presence_penalty":  0.1,
    "frequency_penalty": 0.1,
    "models": [
      "sao10k/l3.1-euryale-70b:nitro",
      "sao10k/l3.3-euryale-70b:nitro",
      "sao10k/l3.1-euryale-70b"
    ]
  }
}
```

**Why these values:**

- `max_tokens=200` — belt-and-braces cap on top of the composer's "1-2 sentence" instruction. Voice fatigues the listener faster than text fatigues the reader — the composer targets 20-40 words, this is the hard ceiling.
- `temperature=0.85` — slightly warmer than the chat model (which is 0.8) because voice replies are shorter and need more variety to feel alive.
- `models[]` — OpenRouter fallback chain. Primary is `:nitro` (auto-routed to whichever provider currently serves it fastest); on 429/5xx we fall back to the `:nitro` L3.3, then the non-nitro default. Total three tries before surfacing an error.
- `presence_penalty` and `frequency_penalty` at 0.1 — mild anti-repetition. Voice loops on filler words ("mm hmm mm hmm") more visibly than text does.

### 9a.4 TTS — Cartesia Sonic-3.5

**Env** (agent worker only): `CARTESIA_API_KEY`

**`model_configs` row** (purpose = `VOICE_TTS`):

```json
{
  "provider": "CARTESIA",
  "modelId":  "sonic-3.5",
  "endpoint": "wss://api.cartesia.ai/tts/websocket",
  "parameters": {
    "model_id":      "sonic-3.5",
    "output_format": {
      "container":  "raw",
      "encoding":   "pcm_s16le",
      "sample_rate": 16000
    },
    "language": "en",
    "speed":    "normal"
  }
}
```

**Voice ID** is **per-character**, not global — resolved at runtime from `voice_presets.providerVoiceId` (the character's assigned voice preset). The seed script only configures the model, not the voice; the agent worker looks up the voice UUID when it joins each room.

**Why these values:**

- `pcm_s16le @ 16000` — matches Deepgram's STT output sample rate. Same-rate pipeline avoids resampling round-trips.
- `speed=normal` — Cartesia allows `slow` / `normal` / `fast`. Companion tone reads best at normal; users perceive `slow` as sultry-uncanny and `fast` as anxious.
- Inline paralinguistic markers (`[laugh]`, `[sigh]`, `[whisper]`, `[breath]`, `[chuckle]`, `[gasp]`) are enabled by default in Sonic-3.5 — no parameter flag needed. The composer teaches the LLM to emit them; Cartesia consumes them natively as real sounds.

### 9a.5 Feature-flag gates

Two env flags gate the whole feature:

| Flag | Scope | Behaviour when `false` |
|---|---|---|
| `VOICE_CALLS_ENABLED` | Web app (server) | `/call/token` returns 422 — no calls can start regardless of client state |
| `NEXT_PUBLIC_VOICE_CALLS_ENABLED` | Web app (client) | Phone icon in chat header renders as disabled with "coming soon" tooltip |

Plus a per-user allowlist: `users.voiceCallsBeta` boolean. Route checks all three before minting a token:

```typescript
if (!env.VOICE_CALLS_ENABLED)          return 422
if (!user.voiceCallsBeta)              return 422
if (concurrent call already open)      return 409
if (user > 60 min today)               return 409
```

Toggle beta per user with [`scripts/toggle-voice-beta.mjs`](../../scripts/toggle-voice-beta.mjs):

```
node scripts/toggle-voice-beta.mjs --email me@example.com --on
node scripts/toggle-voice-beta.mjs --email me@example.com --off
node scripts/toggle-voice-beta.mjs --list
```

### 9a.6 Where to change values later

| Change | Location | Restart needed? |
|---|---|---|
| Model ID (e.g. Nova-3 → Nova-4 when it ships) | `model_configs` row via SQL or `scripts/seed-voice-model-configs.mjs` | No — cache TTL is 60s |
| Model parameters (endpointing, max_tokens, etc.) | Same row's `parameters` JSONB | No — same 60s cache |
| Provider swap (Deepgram → Cartesia STT) | Change `provider` column + update `ModelConfigSttAdapter` | Yes — new adapter |
| API key rotation | `.env` (both web app and agent) | Yes — restart both processes |
| Voice ID per character | `voice_presets.providerVoiceId` in DB | No — resolved per call |
| Enable/disable feature | Env flags | Yes — restart web app |
| Add a beta user | `scripts/toggle-voice-beta.mjs` | No — reads on every request |

---

## 10. Memory transfer from chat to voice

The whole point of using a cascaded pipeline is that our existing memory system plugs straight in unchanged.

### 10a. What gets pulled at call start

Identical to the chat context, minus asterisk-based response style:

```
BuildVoiceContextUseCase
  ├── character.systemPrompt         (characters row)
  ├── MEMORY BLOCK                   (from memory module)
  │     ├── structured facts         (name, city, birthday, job, etc.)
  │     ├── relationship state       (trust/affection/respect tier + streak)
  │     ├── rolling session summary  (conversation_summaries.text)
  │     └── top-K retrieved facts    (hybrid search anchored on last user utterance)
  ├── recent history                 (messages[] where source IN (TEXT, VOICE))
  └── VOICE RESPONSE STYLE           (replaces the chat RESPONSE STYLE — see §13)
```

### 10b. What gets written during the call

Every turn persists as a normal `messages` row on the **same `conversationId`** as text chat:

| Column | User turn | Assistant turn |
|---|---|---|
| `role` | USER | ASSISTANT |
| `content` | STT transcript | LLM output text |
| `source` (new) | VOICE | VOICE |
| `modelId` | null | `sao10k/l3.1-euryale-70b:nitro` |
| `voicePresetId` (new) | null | resolved TTS voice used |
| `audioR2Key` (new) | user audio blob key | TTS audio blob key |

Because they share `conversationId` with text messages:

- **Continuity:** when the user closes the call and returns to typing, the transcript appears inline in the message feed with a subtle voice-icon indicator on each bubble.
- **Memory ingestion runs uniformly.** The existing `IngestTurnUseCase` runs on voice turns via `after()` just like text turns. Structured facts extracted during a call ("my birthday is October 3rd") are available on the next text turn immediately.

### 10c. Post-call summary

At `POST /api/chat/[id]/call/end`:

1. Flush any turns whose `after()` handler is still pending.
2. Generate a **call summary row** in a new `call_sessions` table with duration, turn count, and a 2-sentence LLM-generated recap. Cheap (~$0.001 per call).
3. Update `relationship_state.streak` and any other engagement counters.

Candy AI's "Previous call transcripts" branch in their published diagram is literally this: the call summary feeds back into the memory block on subsequent turns so the character can naturally say "That was a nice talk yesterday — how are you feeling now?"

---

## 11. Turn-taking state machine

Drives the character-status pill in the top-right of the call screen:

```
┌─── connecting ───┐
        ↓
    listening ────────────────┐
        ↓ VAD start           │
   user_speaking               │
        ↓ VAD end              │
   character_thinking          │  barge-in: user starts speaking during
        ↓ TTS first byte       │  any of these three states →
character_speaking ────────────┘  LiveKit cancels TTS, jumps back to
        ↓ TTS complete            user_speaking, drops the partial
    listening                     assistant message with a truncation flag
```

LiveKit emits state events for every transition; the React client subscribes and maps each to the UI pill.

Fallback state: if the user goes silent for ~4 s while it's their turn, the character emits a soft prompt ("Hey? Still there?") — handled by a client-side idle timer that fires an artificial user turn `[user is silent]` into the pipeline. Cydonia and Euryale both handle this stage-cue pattern gracefully.

---

## 12. Schema deltas

Small and reversible.

```prisma
enum MessageSource {
  TEXT
  VOICE
}

model Message {
  // existing fields...
  source        MessageSource  @default(TEXT)
  audioR2Key    String?        // R2 key for stored audio blob (user OR TTS)
  ttsMarkupTags String[]       // ["laugh", "sigh"] extracted from LLM output for analytics
}

model VoicePreset {
  // existing fields...
  provider           String   // "cartesia" | "elevenlabs"
  providerVoiceId    String   // Cartesia voice UUID (or provider equivalent)
  emotionTags        String[] // ["sultry", "warm", "playful"] hints for prompt composition
}

model CallSession {
  id             String   @id @default(uuid()) @db.Uuid
  conversationId String   @db.Uuid
  userId         String   @db.Uuid
  characterId    String   @db.Uuid
  startedAt      DateTime
  endedAt        DateTime?
  durationSec    Int?
  turnCount      Int      @default(0)
  costCredits    Int      @default(0)
  dropReason     String?  // "user_hangup" | "user_disconnect" | "credit_exhausted" | "provider_error"
  summary        String?  // 2-sentence LLM recap for future memory context
  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])
  character      Character    @relation(fields: [characterId], references: [id])

  @@index([conversationId, startedAt])
  @@index([userId, startedAt])
}
```

Plus RLS policies on `call_sessions` matching the existing conversation/message RLS patterns.

---

## 13. Prompt composition sample

The voice system prompt built by `TemplateVoicePromptComposer.composeVoice()`:

```
You are Isabella, a 24-year-old Latina woman.
Personality: temptress. Playful, teasing, magnetic...  [same as chat]
Relationship: girlfriend. ...
Occupation: musician. ...

── MEMORY BLOCK ──
User's name: Salvador
User's city: Madrid
Trust: high (8/10)  Affection: intense (9/10)  Respect: high (7/10)
Session summary: They've been dating 6 weeks. Fight yesterday about him being distant. Reconciled by end of chat.
Top facts:
- User works late nights on his startup
- User's father disapproves of the relationship
── END MEMORY ──

── PREVIOUS CALL ──
2 days ago (4 min call): Made up after argument, planned dinner Saturday
── END PREVIOUS CALL ──

── VOICE RESPONSE STYLE ──
You are speaking OUT LOUD via TTS. Every character you write becomes audible.

- Natural spoken English. Use contractions ("I'm", "you're", "can't").
- Sparingly use filler words when they fit the emotional beat ("mm", "oh…", "hmm").
- 1-2 sentences per turn on average. Reserve a rare 3-sentence beat for genuine emotional peaks.
- NO asterisk actions. NO emojis. NO stage directions. Anything you write becomes speech.
- Emotional markers: write [laugh], [sigh], [whisper], [breath] inline when they fit the moment — the TTS renders these as real sounds.
- Never say the user's name twice in a row. Once every few turns feels natural.
- If the user goes silent for 4+ seconds, gently prompt them ("Salvador? … you still there?").
── END STYLE ──

[messages history — text + voice turns interleaved by createdAt]
```

Key differences from the text `RESPONSE STYLE`:

- No `*asterisk actions*` — they'd be spoken as "star star she smiles star star".
- No emojis — TTS would either skip them or read the Unicode name.
- Tighter length cap — voice fatigues the listener faster than text fatigues the reader.
- Contractions and interjections explicitly allowed — they read as natural speech.
- Cartesia's inline `[emotion]` markup replaces asterisk actions for the paralinguistic beats.

---

## 14. Implementation phases

Total calendar time for solid v1: **~6 weeks**.

### Phase 0 — Accounts + env (½ day)

- Sign up for LiveKit Cloud, Cartesia, Deepgram (fallback).
- Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CARTESIA_API_KEY`, `DEEPGRAM_API_KEY` to `src/config/env.ts` with Zod validation.

### Phase 1 — Infrastructure (1 week)

- Prisma migration for the three schema deltas in §12.
- New module `src/modules/voice/` with the same layer separation as `chat/`:
  - `domain/` — `CallSession` entity, errors.
  - `application/` — ports (`SpeechToTextPort`, `TextToSpeechPort`, `VoiceAgentPort`), use cases (`StartCallUseCase`, `EndCallUseCase`, `BuildVoiceContextUseCase`).
  - `infrastructure/` — Cartesia STT adapter, Cartesia TTS adapter, LiveKit agent adapter.
  - `composition/` — factories wired via `ServerContext`.
- Deploy the LiveKit Agent worker as a separate Node container (Railway / Fly.io) — it can't live inside Next.js because it needs to hold long-running WebRTC connections.
- New routes:
  - `POST /api/chat/[conversationId]/call/token` — issues a LiveKit access token; server spawns the agent for that room.
  - `POST /api/chat/[conversationId]/call/end` — writes the `CallSession` row + triggers post-call summary.

### Phase 2 — Cascaded pipeline (2 weeks)

- LiveKit Agent config: Cartesia Ink STT → custom LLM adapter (wraps existing `OpenRouterChatLlm` + `BuildVoiceContextUseCase`) → Cartesia Sonic TTS.
- Per-utterance persistence to `messages` (STT `is_final` → user row; LLM stream done → assistant row).
- New `TemplateVoicePromptComposer` — sibling of the chat composer, swaps in the VOICE RESPONSE STYLE block from §13.

### Phase 3 — UI (1 week)

- Phone icon in `ConversationHeader` (already has the placeholder button, currently `disabled`).
- Full-screen call overlay component: portrait, animated state pill, call timer, mic mute toggle, hang-up button.
- `@livekit/components-react` for browser-side connection + audio track subscription.
- Loading states, error toasts, permission-denied fallback (offer text chat instead).

### Phase 4 — Polish (1 week)

- **Barge-in / interruption:** VAD detects user speech during `character_speaking` → LiveKit's TTS cancellation flag; mark the truncated assistant message row with `wasInterrupted=true`.
- **Emotion markers:** teach the LLM to emit inline `[laugh]` / `[sigh]` markup; Cartesia consumes them natively.
- **Recording (optional):** store the mixed audio stream to R2 for playback / analytics.
- **Post-call summary** via existing `IngestTurnUseCase` + a call-specific summarizer that writes to `call_sessions.summary`.

### Phase 5 — Production hardening (1 week)

- Rate limits per user (max 1 concurrent call, daily minutes cap).
- Credit deduction ticker: deduct 1 credit / 12 s during active call; hang up on `costCredits >= user.credits`.
- Reconnection: LiveKit auto-reconnects for up to 60 s on network flap — client shows a "reconnecting" state.
- Analytics: track average turn latency, cost per call, drop reasons in a lightweight aggregation table (or Datadog if we've adopted it by then).

---

## 15. Cost model

Unit cost per active call minute for the finalized stack:

| Component | Rate | Cost/min |
|---|---|---|
| LiveKit Cloud | $0.005/participant-min after free tier | $0.005 |
| Cartesia Ink-2 (STT) | $0.006/min | $0.006 |
| OpenRouter Euryale `:nitro` (LLM) | ~$0.85 avg per 1M tokens, ~600 tokens/turn × 8 turns/min | $0.004 |
| Cartesia Sonic-3.5 (TTS) | $0.017/min at typical speaking density | $0.017 |
| Infrastructure (Postgres, R2, agent worker) | Amortized | $0.003 |
| **Total unit cost** | | **~$0.035** |

Retail pricing at 5 credits/min (Candy AI charges 3-15 tokens/min):

- 5 credits = $0.50 at our $0.10-per-credit pack pricing.
- **Gross margin per minute: ~$0.465 → 92% GM.**

Heavy user at 30 min/day = $1.05 server cost / day vs $15 credit spend → sustainable at scale.

---

## 16. Latency-hiding tricks

Two cheap wins Candy AI almost certainly uses. Neither is provider-specific.

### 16a. Speculative TTS start

Fire the TTS request the moment the LLM has emitted the first ~8-12 tokens (roughly the end of the first sentence's opening clause). Cartesia streams the audio anyway; if the LLM finishes with more text, we concatenate a second TTS request seamlessly on the audio track.

Hides ~200-400 ms of LLM tail latency without any UX downside.

### 16b. UI micro-feedback

The "Listening → Thinking → Speaking" state pill updates the moment STT emits its first interim transcript, well before `is_final` — and long before the LLM has started. Users perceive the character as "responding" at ~200 ms even though real audio doesn't arrive until 700-1000 ms.

Costs nothing; wire in Phase 3 alongside the base UI.

Fold both into Phase 4 polish, or leave 16b at Phase 3 (it's essentially free with the LiveKit event stream).

---

## 17. Deferred / future evaluations

Not blockers — pick these up post-v1.

- **Cartesia Line** (S8) once it hits GA — could collapse the three integrations into one API. Watch their changelog.
- **ElevenLabs v3** if Cartesia's emotional range ever feels flat next to competitors — reserved for premium-tier voice.
- **Self-hosted Kokoro TTS** if per-minute costs balloon at scale (10k+ concurrent users). Kokoro is 82M parameters, runs on a single T4 GPU, and hits 30-50 ms first byte — but the voice quality gap versus Cartesia is real. Only sensible if TTS is >30% of monthly infra spend.
- **SIP / phone-line calls** via Twilio Programmable Voice — the LiveKit Agent already supports SIP endpoints. Useful if we ever ship a "call your companion from any phone" premium feature.
- **Voice cloning per character** — Cartesia supports it. Would let each seeded character have a bespoke voice sample rather than picking from the shared `voice_presets` pool.
- **Multi-lingual voices** — Cartesia Sonic supports 15+ languages with same-voice cross-lingual synthesis. Aligns with the `characters.language` field we already store.
