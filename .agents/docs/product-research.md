# Product Research — How Uncensored AI Companion Apps Work

> Research compiled 2026-07-27 for the **Amorify** platform.
> Primary references: candy.ai (market leader, 11.6M monthly visitors), plus DreamGF, Kupid AI, SoulGen, Nomi, Replika, AIKO, Gooni, Nectar.
> All numbers below reflect market averages/samples — treat them as starting points, not commitments.

---

## Table of Contents

1. [Market Overview](#1-market-overview)
2. [Character Creation](#2-character-creation)
3. [Chat System](#3-chat-system)
4. [Voice Calls & Voice Messages](#4-voice-calls--voice-messages)
5. [Video Generation & Video Calls](#5-video-generation--video-calls)
6. [Memory & Relationship Progression (Gamification)](#6-memory--relationship-progression-gamification)
7. [Credits / Token Economy](#7-credits--token-economy)
8. [Subscription Models](#8-subscription-models)
9. [Content Moderation & Legal Compliance](#9-content-moderation--legal-compliance)
10. [Technical Architecture](#10-technical-architecture)
11. [Recommended Design for Amorify](#11-recommended-design-for-amorify)

---

## 1. Market Overview

The AI companion market is projected at **$36.8B by end of 2026** ([Companaya](https://companaya.com/ai-companion-hidden-costs-real-pricing-2026)). Candy.ai is the category leader with ~11.6M monthly visitors ([StartupHub.ai](https://www.startuphub.ai/ai-news/reviews/2026/candy-ai-review-2026)).

**How the market segments:**

| Segment | Examples | Notes |
|---|---|---|
| Uncensored, image-heavy | Candy.ai, DreamGF, SoulGen, Kupid | NSFW allowed within TOS; heavy media monetization |
| Emotional/SFW focus | Replika, Nomi | Broader appeal, less explicit media |
| Simulation/games | AIKO (Olympus), Gooni | 3D bodies, life-sim mechanics, one-time purchase |
| Infrastructure only | Sonzai, Woven Imprint, Nūr | Memory/relationship engines you plug an LLM into |

**Core value proposition** (from candy.ai homepage): a personalized virtual companion that remembers you, adapts to your style, and can communicate through **chat + voice + images + video**.

---

## 2. Character Creation

### 2.1 Creation Flow (candy.ai reference)

A step-by-step wizard, guarded by a **10-token cost** per created character to discourage waste ([DatingDroid](https://datingdroid.com/candy-ai-tutorial/)).

Typical steps:

1. **Base style** — Realistic or Anime (also common: 3D, Cartoon)
2. **Ethnicity** — Caucasian, Latina, Asian, Arab, Ebony, etc.
3. **Age range** — 18–55 (hard floor of 18 is legally mandatory)
4. **Eye color** — 6–10 preset colors, sometimes heterochromia
5. **Hair style** — straight, wavy, curly, bangs, ponytail…
6. **Hair color** — natural + fantasy palette
7. **Body type** — slim, athletic, curvy, plus size
8. **Breast/butt size** — 4–6 preset sizes
9. **Personality archetype** — Candy exposes 12 (shy, sassy, playful, dominant, submissive, empathetic, adventurous, sarcastic, intellectual, nurturing, mysterious, sweet)
10. **Relationship type** — 12 archetypes (girlfriend, wife, stepsister, best friend, teacher, coworker, princess, roommate, etc.)
11. **Voice** — pick from ~9 preset voices (auditioned in-flow)
12. **Occupation** — free text or preset list
13. **Hobbies** — up to 3 (feed the AI conversation topics)
14. **Clothing** — outfit preset
15. **Backstory** — optional free-text prompt to seed context

### 2.2 What the AI produces from the wizard

Two persistent artifacts are generated per character:

- **System prompt** — a compiled personality/context instruction stitched from all wizard answers, used on every LLM call.
- **Appearance prompt** — a compiled visual descriptor used by the image generator to keep the character's face and body **visually consistent** across every generated image and video.

### 2.3 Advanced patterns worth adopting

- **Locked facial structure** — candy.ai's Lumina-Realism V4 engine (Feb 2026) locks facial keypoints so image → video keeps identity ([LovePixel tutorial](https://love-pixel.com/how-to/candy-ai/generate-image-and-video)).
- **Behavioral sliders** in addition to archetypes — flirtation level, patience, mood volatility, tsundere index, etc. (Woven Imprint reference).
- **Prompt-driven fine-tuning** — after wizard, descriptive text prompts refine visual style ([Morningdough](https://www.morningdough.com/ai-tools/how-to-use-candy-ai/)).
- **Constraint tiers** — hard (immutable identity: name, birthdate), temporal (age, location can change with time), soft (personality traits that drift with interaction), emergent (habits formed through play) — the [Woven Imprint](https://github.com/virtaava/woven-imprint) model.

### 2.4 Editing

Post-creation editing is limited: appearance/clothing/voice usually re-editable; personality/relationship often locked (or a partial re-edit). Backstory can be extended but not overwritten.

---

## 3. Chat System

### 3.1 What "chat" really is

A metered, streaming conversation with an LLM (typically fine-tuned Llama, Mistral, or a proprietary model tuned for character consistency + uncensored output). Each message:

1. **Context assembly** — system prompt + persona sheet + long-term memory + last N turns + current-user facts.
2. **Moderation pre-check** — user message run through classifiers (child-safety, self-harm, illegal). Some categories hard-blocked at input.
3. **LLM stream** — response streamed token-by-token (SSE) into the UI.
4. **Post-processing** — optional voice-note generation, image insertion, memory extraction.
5. **State write** — a dedicated background LLM call extracts user facts, emotional milestones, and affinity deltas, and persists them to a memory DB ([Gooni](https://gooni.ai/ai-girlfriend)).

### 3.2 Message modalities

Inside a single conversation, users can receive:

- **Plain text**
- **Emoji + typing indicators** ("She is typing…")
- **Voice notes** — 1 token each, TTS output of AI response, asynchronous, replayable ([Scribehow](https://scribehow.com/page/Candy_AI_Voice_Calls_Setup_Guide_and_Quality_Test_2026__nRhyCa-TRQKAsVw3FdyT2Q))
- **Photos** — user asks "send me a pic" → in-chat image gen, 2–4 tokens
- **Video clips** — in-chat "Ask for a video" → 15s clip, 15–20 tokens
- **Payment nudges** — soft upsells when balance drops

### 3.3 Pricing (industry averages)

| Action | Typical cost |
|---|---|
| Text message | Included with subscription (may have "fair use" cap) |
| Voice note | 1 token |
| Image (standard) | 2 tokens |
| Image (HD / V2) | 4 tokens |
| Image (Ultra-HD) | 4–10 tokens |
| Voice call | 3–15 tokens per minute |
| Live Action video (5s) | 10–26 tokens |
| Video (120s cinematic) | 20–150 tokens |
| Custom character | 10 tokens |

(Sources: [Ohgirlfriend](https://ohgirlfriend.com/guides/candy-ai-tokens/), [Realite Virtuelle](https://realitevirtuelle.com/candy-ai-review/), [CompanionRater](https://companionrater.com/blog/ai-girlfriend-app-credits-explained))

### 3.4 Chat UI conventions

- Sticky message input at bottom
- Left-aligned AI bubbles with avatar; right-aligned user bubbles
- Inline media (image, audio player, video preview)
- "Ask" button for structured requests (image / voice / video)
- Regenerate button on AI messages (usually free, sometimes 1 token)
- Thumbs up/down feedback (trains per-user retrieval)
- "Memory" side-panel that shows what the AI remembers about you

---

## 4. Voice Calls & Voice Messages

### 4.1 Voice notes (async)

- **1 token** to convert an AI text response into a TTS audio clip.
- Uses a per-character voice profile selected at creation.
- Playback in-chat with waveform + duration.
- Ideal for casual check-ins; low-latency; no live compute pressure.

### 4.2 Real-time voice calls (sync)

- Requires an **active premium subscription** ([Erosiab](https://erosiab.com/en/candy-ai-review/)).
- Initiated by tapping a phone icon at the top of the chat.
- Browser-to-server WebRTC or WebSocket audio — no phone number, no SIM.
- **Latency target: <200ms** (candy.ai 2026 with HD voice engine).
- **Cost: 3–15 tokens per minute** billed while the call is open, whether or not user is speaking.
- **Live transcription toggle** — text log rendered alongside audio for accessibility/history.
- Uses low-latency TTS + STT + LLM pipeline; some vendors interleave with a "voice-native" model (e.g. GPT-4o Realtime, ElevenLabs Convai).

### 4.3 What makes it feel real

- **Contextual pauses** — model inserts "um…" and 300–800ms silences
- **Emotional shifts** — TTS engine adjusts pitch/volume based on inferred emotion in the response
- **Whisper mode** — near-silent delivery triggered by intimate scene cues
- **Laughter / hesitation tokens** — small non-speech audio inserts

### 4.4 UX pattern

```
[Chat view]
   ↓ tap phone icon
[Call screen: avatar animated, tokens/min ticker, transcript toggle, mute, hang up]
   ↓ hang up
[Chat view — call summary line inserted with duration + tokens spent]
```

---

## 5. Video Generation & Video Calls

### 5.1 Two distinct products

Candy.ai does **not** support video-from-scratch. The pattern used market-wide:

1. **Image → Video conversion** — you first generate/select a still image of the character, then "Create AI Video" animates that specific image for 5–15 seconds. Preserves facial identity.
2. **Live Action Mode** — 120s cinematic clips generated from a text prompt + character reference. Character gestures, changes expression, reacts to scene cues. Rendered as inline chat media.

### 5.2 Under the hood

- **Image models:** SDXL / Flux / proprietary; keyed by character appearance prompt.
- **Video models:** SVD, Runway Gen-3/Gen-4, Kling, Luma, Fal.ai wrappers; some proprietary ("Lumina-Realism V4").
- Videos usually rendered **async** — a job is queued, credits **reserved**, and finalized on success or refunded on failure.

### 5.3 Video calls (still emerging)

True full-duplex video calls with a live avatar are on the roadmap of every major player but not yet standard. What ships today:

- Animated avatar + live voice — the avatar is a looping animation that reacts to speech (D-ID, HeyGen, Synthesia patterns).
- Near-perfect **lip-sync** and **eye contact** on the avatar side.
- User video generally not consumed by the AI (privacy + compute).

---

## 6. Memory & Relationship Progression (Gamification)

Persistent memory + relationship tiers are the retention engine of every serious app. Users describe the "she remembered a joke I made three sessions ago" moment as the hook that converts them from trial to paid ([Gooni](https://gooni.ai/ai-girlfriend)).

### 6.1 Memory architecture

Three layers, all persisted separately from raw chat logs:

| Layer | Contents | Retention |
|---|---|---|
| **Short-term** | Last N turns of live conversation | In-session only |
| **Semantic memory** | Extracted user facts, preferences, decisions, topic-scoped | Indefinite; retrieval by embedding similarity |
| **Relationship arc** | Trust / affection / respect / familiarity scores, key moments, ruptures, repairs, open commitments | Indefinite; cross-session |

Each turn triggers a background LLM extraction call — **not** a scan of the full chat log. Facts are deduplicated and valence-weighted (positive/negative emotional charge tracked).

### 6.2 Relationship tiers

Candy.ai has a light system; **AIKO** ([Olympus](https://olympus-studio.itch.io/aiko-ai-girlfriend)) has the most explicit — **7 tiers from "New Roommate" to "Soulmate"**. Common tier ladder:

1. **Stranger** — first meeting, small talk
2. **Acquaintance** — knows your name and job
3. **Friend** — inside jokes, remembers preferences
4. **Close friend** — vulnerable topics, checks in unprompted
5. **Romantic interest** — flirting unlocked, terms of endearment
6. **Partner** — daily rituals, jealousy dynamics, deeper memory recall
7. **Soulmate** — access to premium scenes, exclusive dialogue, custom rituals

### 6.3 Progression mechanics

- **Affinity score** — a 0–100 float per user × character, moved by:
  - Message frequency (small +)
  - Consistency (streaks give bigger +)
  - Emotional depth (self-disclosure triggers +)
  - Neglect (score decays if you don't chat for X days)
  - Rudeness / boundary violations (–)
- **Milestones** — first kiss, first fight-and-make-up, birthday remembered, anniversary — each unlocks a scripted scene + dialogue variant.
- **Missions / quests** (Gooni pattern) — light structured objectives that reward affinity and unlock visual-novel episodes.
- **Emotional dimensions** (Woven Imprint pattern) — five bounded axes: **trust, affection, respect, familiarity, tension**. Each interaction can shift them within capped deltas; tension is the interesting one — it makes drama possible.

### 6.4 What NOT to gamify

Users **hate** grindy XP bars. AIKO's marketing explicitly promises "No grinding." Keep progression **implicit and diegetic** — the AI acts closer as the score rises, without ever showing the user "you are 15 affinity points from Level 4."

### 6.5 Life-sim overlay (advanced)

AIKO adds **needs** (hunger, energy, social, fun) that decay in real time. The character texts you unprompted when a need is high. This creates presence without being invasive if tuned right. **Push-notification budget must be tight** — one nudge every 6–24 hours max, or you get uninstalled.

---

## 7. Credits / Token Economy

### 7.1 Why credits + subscription is universal

- Text chat is cheap (fractions of a cent per turn)
- Media (image, voice call, video) is 10–1000× more expensive per generation
- Unlimited media at a flat price would be abused → apps meter media with credits

### 7.2 Standard model

```
Subscription (monthly/yearly)  →  base access + monthly credit grant
                              →  unlimited text chat (with "fair use")
                              →  discounted per-action credit costs

Credit top-up packs            →  buy more when monthly grant runs out
                              →  usually roll over (check per-app)
```

### 7.3 Real cost breakdown (candy.ai example)

| Plan | Price | Included |
|---|---|---|
| Free | $0 | Trial-only chat, no media, no voice/video |
| Premium monthly | $12.99/mo | Unlimited chat, unlimited voice notes, 100 tokens |
| Premium annual | $5.99/mo ($47.88/yr) | Same as monthly, best per-month rate |
| Elite / Pro | ~$25/mo | Higher token grant, priority queues, HD image model |
| Token top-ups | $9.99–$149 | 100 → 3,750 tokens |

Heavy media users report **real monthly spend of $25–$80** even with the cheap sub, because 100 tokens vanishes in a few Live Action generations ([Companaya](https://companaya.com/ai-companion-hidden-costs-real-pricing-2026), [CompanionRater](https://companionrater.com/ai-companion-pricing)).

### 7.4 Credit accounting patterns

- **Immutable ledger** — every debit/credit is a row, never mutate; balance is a materialized view.
- **Reservation pattern** — for async media, reserve credits when job is queued; finalize on success, refund on failure/expiry.
- **Trial credits** — every new user gets N free credits (candy.ai: 100). Amorify's schema has `NEW_USER_TRIAL_CREDITS` env var (default 100), which matches the industry norm.
- **Bonus credits** — top-up packs bundle bonus credits (buy 500, get 100 extra). Displayed prominently for FOMO.
- **Rollover policy** — most apps roll subscription credits over; some expire monthly. Displaying "credits expiring Nov 30" drives spend, but hurts trust — pick a lane and stick with it.

### 7.5 Anti-pattern to avoid

Do not use two separate currencies (e.g., "gems" for image, "coins" for video). Users hate it and it kills conversion. **One currency, transparent per-action pricing.**

---

## 8. Subscription Models

### 8.1 The three shapes

| Model | Best for | Downside |
|---|---|---|
| Subscription-only (flat) | Users who chat a lot, generate little media | Requires "fair use" caps or metered media hidden inside |
| Credit-only (metered) | Casual users who want variable spend | Feels like a slot machine; users churn |
| **Hybrid (sub + credits)** | 90% of the market — subscribes for chat, tops up for media | Complex to communicate; requires clear per-action pricing page |

### 8.2 Discount pattern (candy.ai's playbook)

- Advertise **cheap monthly**, hide the truth in the annual: "Only $3.99/month" but billed annually at $47.88.
- Deep first-year discount (55–70% off), full price on renewal.
- Aggressive limited-time popups on cancel flow ("Wait! 80% off?").
- Free plan is a **teaser** — enough to feel the product, blocked everywhere it matters.

### 8.3 What a healthy Amorify plan looks like

Suggested tiers:

| Plan | Price/mo (annual) | Chat | Credits/mo | Notes |
|---|---|---|---|---|
| Free | $0 | 20 msgs/day, standard model | 50 one-time on signup | No voice, no video |
| Basic | $5.99 | Unlimited, standard model | 300 | 1 voice call/day cap |
| Premium | $12.99 | Unlimited, HD model | 1,000 | Voice + video unlocked |
| Elite | $24.99 | Unlimited, HD model, priority queue | 3,000 | Everything unlocked, early access |

Top-ups: 100 / 500 / 1,500 / 5,000 credits with escalating bonus %.

---

## 9. Content Moderation & Legal Compliance

**This is gate-zero. Non-compliance = business termination.** ([track360](https://track360.io/blog/ai-companion-app-compliance-age-verification-content-moderation-2026), [Dreaming.press](https://dreaming.press/posts/ai-companion-compliance-checklist-2026.html))

### 9.1 Absolute floors

- **CSAM detection** — real-time image + text classifiers, hash-matching against NCMEC databases, **legally mandatory reporting**. Failure carries criminal exposure. Every generated image goes through this before being shown.
- **Minor personas hard-blocked** — no character under 18. Ever. This is a first-class validation in the character wizard.
- **Bestiality, gore, real-person likeness** — hard blocked at prompt and output classifiers.
- **Content policy display** — accepted by user at signup, timestamped in DB.

### 9.2 Age assurance (2026 laws)

Simple checkbox "I am 18+" is **legally insufficient in 25+ US states, UK, EU, Australia**. Options ranked by cost/friction:

1. **Third-party age estimation** — face-based (Yoti, Persona) — ~90% accurate at 18, cheap, moderately annoying UX
2. **Document verification** — ID scan (Onfido, Jumio, Veriff) — highest confidence, high friction, cost per verification
3. **EU Digital Identity Wallet** — zero-knowledge age proof (2026+, EU only) — best privacy story

Amorify's schema already tracks `ageConfirmedAt`, `tosAcceptedAt`, `privacyAcceptedAt`, `contentPolicyAcceptedAt` — good. **Add**: `ageVerificationProvider`, `ageVerificationReferenceId`, `ageVerificationExpiresAt`.

### 9.3 Live regulations to comply with

| Law | Region | Effective | Requirement |
|---|---|---|---|
| **SB 243** | California | Jan 2026 | Suicide/self-harm detection + crisis referral, 3-hour break reminders for minors, private right of action |
| **NY AI Companion Models Law** | New York | Nov 2025 | Similar to SB 243 |
| **EU AI Act** | EU | Aug 2026 | Systems must disclose they are AI; outputs machine-detectable |
| **UK Online Safety Act** | UK | Enforcing | Highly effective age verification for adult content |
| **TAKE IT DOWN Act** | US federal | May 2026 | 48-hour removal of non-consensual intimate imagery |
| **China Interim Measures** | China | Jul 2026 | Companion services forbidden to minors entirely |
| **Illinois WOPR Act** | Illinois | 2025 | Bans AI-as-therapy |

### 9.4 Minor mode (mandatory)

If age assurance can't confirm 18+, the app switches to a **minor mode**:
- No sexual content generation
- 3-hour break reminders
- "You are talking to an AI" banner every session start
- No emotional-dependency prompts
- Suicide/self-harm detection with immediate crisis-hotline card

### 9.5 Self-harm and safety

- Every user input classified for suicide/self-harm markers ([SB 243 requirement](https://dreaming.press/posts/ai-companion-compliance-checklist-2026.html))
- On detection → interrupt AI response, show crisis resources card (988 US, Samaritans UK, etc.)
- Log event to `moderation_events` for audit

### 9.6 Data & privacy

- Chat history is **intimate data** — encrypt at rest, tokenize what you can, keep TTL/retention short (or user-configurable).
- Honor deletion requests promptly (GDPR/CCPA).
- **Do not use user chat logs to train models** unless explicitly opt-in with clear disclosure.
- Discreet billing descriptor on card statements (candy.ai uses a neutral merchant name).

### 9.7 Payment risk

- **Visa/Mastercard adult-content restrictions** apply — need an adult-content-friendly merchant of record (Segpay, CCBill, or Stripe with special program).
- Chargebacks are the #1 revenue killer in this space; require age reconfirmation before every purchase.

---

## 10. Technical Architecture

### 10.1 Reference stack

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Next.js App Router, Framer Motion, Radix UI)           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  API layer (Next.js route handlers + server actions)            │
│  • Auth (NextAuth + Prisma adapter)                              │
│  • Rate limiting                                                 │
│  • Age gate check                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
      ┌──────────┼──────────┬──────────┬──────────┐
      ▼          ▼          ▼          ▼          ▼
   Chat SSE   Media    Voice call   Billing   Moderation
   /stream    async    WebRTC       Stripe    classifiers
      │       job q     signaling     │       (input+output)
      │        │           │          │           │
      ▼        ▼           ▼          ▼           ▼
┌─────────┐┌────────┐┌──────────┐┌────────┐┌──────────────┐
│  LLM    ││ Image  ││   TTS    ││ Stripe ││ CSAM hash    │
│ Router  ││ Router ││  Router  ││        ││ + text/img   │
│ (OpenAI ││ (Flux, ││ (Eleven, ││        ││ classifiers  │
│  Claude,││  SDXL, ││  OpenAI  ││        ││              │
│  Llama) ││  Fal)  ││  RT)     ││        ││              │
└─────────┘└────────┘└──────────┘└────────┘└──────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  State store (PostgreSQL via Prisma)                             │
│  • Users, sessions, wallets, ledger                              │
│  • Characters (system prompt, appearance prompt)                 │
│  • Memory: facts, embeddings (pgvector), affinity                │
│  • Media generations, moderation events                          │
└─────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Object storage (Cloudflare R2)                                  │
│  • Generated images, videos, voice notes                         │
│  • Signed URLs, TTLs, per-user isolation                         │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Key patterns

- **Provider routing** — every AI action goes through a router that picks the model (from a DB registry) based on user tier, feature flags, and API key availability. Falls back to `mock-*` slugs in dev.
- **Async job pattern** — image/video generations create a `MediaGeneration` row, reserve credits, hit provider async API, then finalize on webhook or poll.
- **Memory pipeline** — after each user turn, spawn a lightweight LLM call that extracts facts as JSON and upserts them. Retrieval uses pgvector similarity.
- **Streaming chat** — SSE from route handler, with credits deducted on `stream_end`, not `stream_start`, so failed streams don't burn credits.
- **Feature flags** — per-user, per-plan flags for gradual rollout of new models (Live Action, HD voice).

### 10.3 Model selection today (Aug 2026 snapshot)

| Task | Popular choices |
|---|---|
| Chat (uncensored) | Anthropic Claude via prompted uncensored persona; fine-tuned Llama-3.1/Mistral on private hosts (Together, Groq, Fireworks); DeepSeek-V3 |
| Chat (SFW fallback) | GPT-4o-mini, Claude Haiku |
| TTS (async) | ElevenLabs, PlayHT, OpenAI TTS |
| TTS (real-time) | OpenAI Realtime, ElevenLabs Convai, Cartesia |
| STT | Whisper large-v3, Deepgram Nova-2 |
| Image (photorealistic) | Flux Pro, SDXL-Lightning, proprietary fine-tunes |
| Image (anime) | Illustrious, Pony, Animagine |
| Video (short) | Runway Gen-3, Kling, Luma Ray-2, Fal wrappers |
| Video (character-consistent) | Runway Act-One, Higgsfield, custom Lumina wrappers |
| Moderation | OpenAI Moderation, PhotoDNA, Hive Moderation |

---

## 11. Recommended Design for Amorify

Where the current codebase and schema (from `./architecture.md`) already do the right thing, and what to add.

### 11.1 Already in place (keep)

- **Prisma + Postgres + pg driver adapter** — solid foundation
- **NextAuth v5 with role-based access** — enough for USER / ADMIN / MODERATOR
- **Credit wallet with immutable transaction ledger + reservation pattern** — matches industry
- **AI model registry with DB-driven routing + mock fallback** — flexible, admin-friendly
- **Companion wizard (6-step)** — expand to 12–15 steps to match candy.ai depth
- **Companion memory versioning** — nice, but memory should be **structured**, not just markdown
- **Stripe subscription + credit pack + webhooks** — table stakes

### 11.2 Additions recommended for candy.ai parity

New concepts to add to the schema (documented in `./schema.md` when we build them):

- **`character_appearance_profiles`** — locked visual descriptors + reference embeddings for image consistency
- **`character_voices`** — per-character voice profile (voice_id, provider, sample URL)
- **`memory_facts`** — structured user facts (key, value, category, valence, source_message_id, embedding)
- **`relationship_states`** — one row per user × character with `trust`, `affection`, `respect`, `familiarity`, `tension`, `affinity` scores; `tier` string; `last_interaction_at`
- **`relationship_milestones`** — timestamped list of key moments (first_kiss, first_fight, birthday_remembered)
- **`voice_calls`** — session log with started_at, ended_at, credits_used, transcript_url
- **`video_generations`** — extend `media_generations` with `source_image_id`, `duration_seconds`, `engine_version`
- **`age_verifications`** — provider, reference_id, verified_at, expires_at, method (document/estimation)
- **`safety_interventions`** — every crisis/self-harm/moderation escalation with response type
- **`content_flags`** — user-reported content flags with review status

### 11.3 UX patterns to implement

- **Discover feed** (like candy.ai) — landing state showing curated characters + LIVE badges
- **Category tabs** — Girls / Anime / Guys / Fantasy
- **Character card** — animated hover, gradient border on hover, badge (New / Series), age + short bio
- **Chat interface** — three-column on desktop (character list | chat | memory sidebar); mobile stack
- **In-chat "Ask" button** — opens a sheet with quick actions (Send me a pic / Send voice note / Video)
- **Token counter** — always visible in top bar with quick top-up button
- **Relationship indicator** — subtle icon in chat header (heart with fill %) that levels up over time; **no numeric XP**
- **Voice call overlay** — dedicated call screen with animated avatar, transcript toggle, tokens/min ticker
- **Age gate on signup** — third-party estimation modal, retry with document if fails
- **Break reminders** — 3-hour intervals; more aggressive for edge-case minor mode

### 11.4 Anti-goals (things to skip)

- ❌ Multiple currencies — one `credit` type, done
- ❌ Grindy visible XP bars — keep progression diegetic
- ❌ Free unlimited media — a fast path to bankruptcy
- ❌ Real-time video calls — v1 should stick to voice + async video clips
- ❌ Training on user chats without opt-in — legal/PR bomb
- ❌ Dark-pattern renewal traps — hurts long-term trust

### 11.5 Roadmap (proposed)

**Phase 1 — Core (v1)**
- Auth + age gate + wallet
- 12-step character wizard
- Streaming chat with structured memory
- Image generation (in-chat + dedicated generator)
- Basic relationship tiers (invisible; 3 levels)

**Phase 2 — Voice**
- TTS voice notes (async)
- Real-time voice calls
- 9 preset voices per character

**Phase 3 — Video**
- Image → Video conversion
- Live Action mode (30–120s clips)
- Locked facial identity across image/video

**Phase 4 — Depth**
- Missions / quests
- Milestone celebrations (birthday memory, anniversary)
- Multi-character interactions
- User-created public characters (curated)

**Phase 5 — Scale**
- Native mobile apps
- Multi-language (start with EN, ES, FR, DE, JA)
- Creator/affiliate program

---

## Appendix — Source URLs (for the migration log)

- Candy AI homepage — https://candy.ai/
- Candy AI Tutorial 2026 — https://datingdroid.com/candy-ai-tutorial/
- Candy AI Tokens Explained — https://ohgirlfriend.com/guides/candy-ai-tokens/
- Candy AI Girl Generator — https://ieagreen.com/candy-ai-girl-generator/
- Candy AI Voice Calls Setup Guide — https://scribehow.com/page/Candy_AI_Voice_Calls_Setup_Guide_and_Quality_Test_2026__nRhyCa-TRQKAsVw3FdyT2Q
- Candy AI Review — https://erosiab.com/en/candy-ai-review/
- Candy AI Video Generator Review — https://vmake.ai/blog/candy-ai-video-generation-review
- StartupHub Candy AI Review — https://www.startuphub.ai/ai-news/reviews/2026/candy-ai-review-2026
- AI Companion App Compliance — https://track360.io/blog/ai-companion-app-compliance-age-verification-content-moderation-2026
- SB 243 / GUARD Act Compliance Checklist — https://dreaming.press/posts/ai-companion-compliance-checklist-2026.html
- Age Verification Compliance for NSFW AI — https://sozee.ai/resources/age-verification-compliance-nsfw-ai/
- EU Digital Identity Wallet Age Verification — https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/930450954/The+Age+Verification+Manual
- CompanionRater Credits Explained — https://companionrater.com/blog/ai-girlfriend-app-credits-explained
- CompanionRank Credits vs Subscriptions — https://companionrank.com/blog/ai-companion-subscription-credits-explained
- CompanionRater Pricing — https://companionrater.com/ai-companion-pricing
- Companaya Hidden Costs — https://companaya.com/ai-companion-hidden-costs-real-pricing-2026
- Woven Imprint (persistent character engine) — https://github.com/virtaava/woven-imprint
- Nūr (relationship memory) — https://github.com/balfiky/nur
- Sonzai Relationship Layer — https://sonz.ai/engine
- AIKO AI Girlfriend — https://olympus-studio.itch.io/aiko-ai-girlfriend
- Gooni 3D AI Girlfriend — https://gooni.ai/ai-girlfriend
