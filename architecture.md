# Amorify — Architecture

## Overview

Amorify is an AI companion web application built with **Next.js 16 (App Router)**, **PostgreSQL** via **Prisma ORM**, **NextAuth v5** for authentication, and **Stripe** for billing. Users create and interact with AI companions through a credit-based system that gates chat messages and media generation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS v4, Radix UI primitives, Lucide icons |
| Database | PostgreSQL (via `pg` + `@prisma/adapter-pg`) |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (`next-auth@5 beta`) + `@auth/prisma-adapter` |
| Payments | Stripe (`stripe@22`) |
| AI | OpenAI, Anthropic, Stability AI, Runway, Kling, Fal.ai (provider-routed) |
| State | Zustand, TanStack React Query |
| Validation | Zod v4 |
| HTTP client | Axios |
| Utilities | `bcryptjs`, `date-fns`, `uuid` |

---

## Project Structure

```
companion app/
├── prisma/
│   ├── schema.prisma        # Full DB schema
│   └── seed.ts              # Seed data
├── prisma.config.ts         # Prisma 7 config (schema path, DATABASE_URL)
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (public)/        # Marketing pages (no auth required)
│   │   ├── (auth)/          # Login / signup
│   │   ├── (app)/           # Authenticated user app
│   │   ├── (admin)/         # Admin-only panel
│   │   └── api/             # All API route handlers
│   ├── components/
│   │   ├── ui/              # Primitive UI components
│   │   ├── app/             # App shell (Sidebar, Topbar)
│   │   ├── public/          # Marketing Navbar, Footer
│   │   ├── chat/            # ChatInterface, MediaRequestModal
│   │   ├── companions/      # CompanionWizard, WizardStep, MemoryEditor
│   │   └── admin/           # Admin controls (toggles, forms)
│   ├── lib/
│   │   ├── db/              # Prisma client singleton
│   │   ├── auth/            # NextAuth config + exports
│   │   ├── ai/              # Model registry, provider router, prompt builder, moderation
│   │   ├── billing/         # Stripe service, credit service, pricing service
│   │   ├── companions/      # Companion domain logic
│   │   ├── memory/          # Memory load/save
│   │   ├── storage/         # Media storage abstraction
│   │   ├── admin/           # Audit log service
│   │   └── utils.ts         # Shared utilities (cn, etc.)
│   └── proxy.ts             # Auth redirect logic (mirrors middleware behavior)
└── .env                     # Environment variables (never committed)
```

---

## Route Groups & Pages

### `(public)/` — Marketing (no auth)

| URL | Page |
|---|---|
| `/` | Landing page |
| `/pricing` | Pricing tiers |
| `/privacy` | Privacy policy |
| `/safety` | Safety information |
| `/terms` | Terms of service |

### `(auth)/` — Authentication

| URL | Page |
|---|---|
| `/login` | Email + password login |
| `/signup` | New user registration |

### `(app)/app/` — Authenticated User App

Layout enforces auth via `auth()` + `redirect("/login")`, loads Sidebar, Topbar, and credit balance.

| URL | Page |
|---|---|
| `/app` | Dashboard |
| `/app/companions` | Companion list |
| `/app/companions/new` | Create companion (wizard) |
| `/app/companions/:id` | Companion detail |
| `/app/companions/:id/edit` | Edit companion |
| `/app/companions/:id/memory` | View/edit memory |
| `/app/chat` | Chat hub |
| `/app/chat/:companionId` | Active chat session |
| `/app/media` | Media gallery |
| `/app/billing` | Subscription + credit packs |
| `/app/settings` | User settings |

### `(admin)/admin/` — Admin Panel

Layout requires `session.user.role === "ADMIN"`, else redirects to `/app`.

| URL | Page |
|---|---|
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/models` | AI model registry |
| `/admin/models/new` | Add AI model |
| `/admin/models/:id/edit` | Edit AI model |
| `/admin/plans` | Subscription plans |
| `/admin/credit-packs` | Credit pack management |
| `/admin/pricing` | Pricing rules |
| `/admin/moderation` | Moderation events |

---

## API Routes

### Auth
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers |
| `/api/auth/register` | POST | New user signup + trial credits |

### Chat
| Route | Method | Purpose |
|---|---|---|
| `/api/chat/[conversationId]/messages` | GET, POST | Message history |
| `/api/chat/[conversationId]/stream` | POST | SSE AI streaming response |

### Companions
| Route | Method | Purpose |
|---|---|---|
| `/api/companions` | GET, POST | List / create companions |
| `/api/companions/[id]/memory` | GET, PUT | Read / update companion memory |

### Media
| Route | Method | Purpose |
|---|---|---|
| `/api/media` | GET, POST | Media gallery list / create job |
| `/api/media/image` | POST | Generate image |
| `/api/media/video` | POST | Generate video |
| `/api/media/jobs/[id]` | GET | Poll generation job status |

### Billing
| Route | Method | Purpose |
|---|---|---|
| `/api/billing/create-subscription-checkout` | POST | Stripe subscription session |
| `/api/billing/create-credit-checkout` | POST | Stripe one-time credit pack session |
| `/api/billing/estimate` | GET/POST | Credit cost estimate |

### Webhooks
| Route | Purpose |
|---|---|
| `/api/webhooks/stripe` | Stripe event handler (subscription state, credit grants) |
| `/api/webhooks/provider/[provider]` | Generic AI provider job callbacks |

### Admin API
| Route | Purpose |
|---|---|
| `/api/admin/models` + `/[id]` + `/[id]/toggle` + `/defaults` | AI model CRUD + enable/disable + default model |
| `/api/admin/plans/[id]` + `/toggle` | Plan CRUD |
| `/api/admin/credit-packs/[id]` + `/toggle` | Credit pack CRUD |
| `/api/admin/pricing/[id]/toggle` | Toggle pricing rules |
| `/api/admin/users/[id]/credits` | Grant / adjust user credits |
| `/api/admin/users/[id]/status` | Suspend / activate user |

---

## Database Schema

PostgreSQL managed via Prisma. 24 tables across these domains:

### Auth & Users
- **`users`** — Core user record with role (`USER`, `ADMIN`, `MODERATOR`), status, compliance timestamps (age gate, ToS, privacy, content policy), signup IP/UA.
- **`accounts`**, **`sessions`**, **`verification_tokens`** — NextAuth adapter tables.
- **`user_profiles`** — Extended profile (display name, bio, avatar, timezone, preferences JSON).

### Companions
- **`companions`** — Full wizard output: identity, relationship style, personality traits, appearance details, chat tone, intimacy level, memory preferences. Stores generated `systemPrompt` and `appearancePrompt`.
- **`companion_memories`** — Active memory in Markdown + optional JSON, versioned.
- **`companion_memory_versions`** — Full version history of memory edits.

### Chat
- **`conversations`** — Links user ↔ companion. Tracks `lastMessageAt`.
- **`messages`** — Role (`USER`, `ASSISTANT`, `SYSTEM`), content, credits used, model slug, moderation flag, optional media URL.

### Credits & Billing
- **`credit_wallets`** — One per user, integer balance.
- **`credit_transactions`** — Immutable ledger: purchase, grant, deduction, refund, reservation finalize/refund, subscription grant.
- **`credit_reservations`** — Holds credits during async media generation (status: `RESERVED` → `FINALIZED` / `REFUNDED` / `EXPIRED`).
- **`credit_packs`** — Admin-configured purchasable packs (credits + bonus, Stripe price ID).
- **`plans`** — Subscription tiers with monthly/yearly pricing, credit allocations, companion limits, model tier, Stripe product/price IDs.
- **`subscriptions`** — Active user subscription with Stripe state.
- **`pricing_rules`** — Per-action credit costs (e.g. `chat_message`, `image_generation`) keyed by slug, optionally scoped to model or plan.

### AI
- **`ai_providers`** — Registered AI providers (OpenAI, Anthropic, etc.) with enable toggle.
- **`ai_models`** — Individual models: type (`CHAT`, `IMAGE`, `VIDEO`), external model ID, capabilities, streaming support, credit cost per call.
- **`model_defaults`** — Single default model per `ModelType`, set via admin UI.

### Media
- **`media_generations`** — Generation jobs: type, status (`QUEUED` → `PROCESSING` → `COMPLETED`/`FAILED`), prompt, provider job ID, storage key/URL, credits used/reserved.

### Safety & Admin
- **`moderation_events`** — Every content moderation decision: action (`BLOCKED`, `FLAGGED`, `ALLOWED`, `AUTO_MODIFIED`), flagged terms, rule matched.
- **`admin_audit_logs`** — Every admin action with target type/ID and details JSON.
- **`app_settings`** — Key/value store for runtime configuration; public-flagged settings can be exposed to clients.

---

## Authentication Flow

1. **Registration** — `POST /api/auth/register` validates compliance timestamps, hashes password with `bcryptjs`, creates `User` + `UserProfile` + `CreditWallet`, grants trial credits (default 100 via `NEW_USER_TRIAL_CREDITS` env).
2. **Login** — NextAuth Credentials provider: fetches user by email, `bcrypt.compare` password hash, rejects `SUSPENDED` users, requires all four compliance timestamps.
3. **Session** — JWT strategy. `session.user.id` and `session.user.role` are injected via `jwt`/`session` callbacks in `src/lib/auth/config.ts`.
4. **Route protection** — `(app)` and `(admin)` layout files call `auth()` server-side and `redirect()` on failure. Admin layout additionally checks `role === "ADMIN"`.

---

## AI Architecture

### Provider Router (`src/lib/ai/providerRouter.ts`)
Resolves the default model from the DB registry, checks for the required API key in environment variables, and routes to the appropriate provider SDK. Falls back to `mock-*` slugs (e.g. `mock-chat-v1`) when keys are absent, enabling development without live AI keys.

**Supported providers:**
- OpenAI (`OPENAI_API_KEY`) — chat + image
- Anthropic (`ANTHROPIC_API_KEY`) — chat
- Stability AI (`STABILITY_API_KEY`) — image
- Runway (`RUNWAY_API_KEY`) — video
- Kling (`KLING_API_KEY`) — video
- Fal.ai (`FAL_API_KEY`) — image / video

### Chat Stream (`POST /api/chat/[conversationId]/stream`)
1. Validate session + conversation ownership
2. Run content moderation (`moderationService`)
3. Look up credit cost via `pricingService`
4. Check + deduct wallet balance (`creditService`)
5. Build system prompt (`promptBuilder` using companion + memory)
6. Call `providerRouter.streamChat()` → SSE response
7. Persist assistant message + credits used

### Media Generation
- Image: `POST /api/media/image` — reserves credits, calls `providerRouter` async image API, creates `MediaGeneration` job.
- Video: `POST /api/media/video` — same pattern with `RUNWAY`/`KLING`/`FAL`.
- Job polling: `GET /api/media/jobs/[id]` — checks `providerJobId` status, finalizes or refunds reservation.

### Model Registry (Admin)
Admins register `AiProvider` + `AiModel` records via `/admin/models`. A `ModelDefault` row per `ModelType` tells the router which model to use by default. Admins can enable/disable individual models and set defaults without a redeploy.

---

## Billing & Credits

### Credit System
Every metered action (chat message, image generation, video generation) has a `PricingRule` with a `creditCost`. The flow:

```
User action → check wallet balance → deduct credits → perform action → record transaction
```

For async media:
```
User action → reserve credits → start job → webhook/poll completion → finalize or refund reservation
```

### Stripe Integration
- **Subscription checkout** — creates a Stripe Checkout Session for a `Plan`; on `checkout.session.completed` webhook, creates/updates `Subscription` and grants monthly credits.
- **Credit pack checkout** — one-time payment for a `CreditPack`; on `checkout.session.completed` webhook, calls `creditService.grantCredits()`.
- **Webhook verification** — raw body + `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent`.

---

## Component Architecture

### App Shell
- **`Sidebar`** — Navigation links to all `/app/*` routes, companion list, credit balance display.
- **`Topbar`** — User menu, notifications area.

### Companion Creation
- **`CompanionWizard`** — Multi-step form orchestrator (6 steps).
- **`WizardStep`** — Generic step wrapper with progress indicator.
- Steps cover: Identity → Details → Personality → Appearance → Chat Style → Memory Preferences.

### Chat
- **`ChatInterface`** — Message thread, SSE stream consumer, credit deduction display.
- **`MediaRequestModal`** — In-chat modal to request image/video generation.

### Memory
- **`MemoryEditor`** — Markdown editor for viewing and editing companion memory. Shows version history.

### Admin Controls
- **`ModelToggle`**, **`PricingRuleToggle`**, **`UserStatusToggle`** — Optimistic-update toggle switches calling the respective admin API routes.
- **`GrantCreditsForm`** — Admin form to manually adjust a user's credit balance.
- **`ModelDefaultSelector`** — Dropdown to set the default model per `ModelType`.
- **`AdminSidebar`** — Navigation for all `/admin/*` routes.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | Canonical app URL for NextAuth callbacks |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXT_PUBLIC_APP_URL` | Client-facing app URL |
| `NEXT_PUBLIC_APP_NAME` | App display name |
| `OPENAI_API_KEY` | OpenAI (chat + image) |
| `ANTHROPIC_API_KEY` | Anthropic Claude (chat) |
| `STABILITY_API_KEY` | Stability AI (image) |
| `RUNWAY_API_KEY` | Runway (video) |
| `KLING_API_KEY` | Kling (video) |
| `FAL_API_KEY` | Fal.ai (image/video) |
| `STORAGE_PROVIDER` | `local` or `s3` |
| `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3 media storage |
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `NEW_USER_TRIAL_CREDITS` | Credits granted on registration (default: 100) |

---

## What Has Been Built

| Area | Status |
|---|---|
| Next.js 16 App Router project scaffold | Done |
| Route group layout structure (public / auth / app / admin) | Done |
| PostgreSQL schema — all 24 tables via Prisma | Done |
| Database migrations run, tables exist | Done |
| NextAuth v5 with Credentials provider + PrismaAdapter | Done |
| User registration API with compliance timestamps + trial credits | Done |
| Role-based route protection (USER / ADMIN) in layouts | Done |
| AI provider router with mock fallback | Done |
| AI model registry (DB-driven, admin-managed) | Done |
| Chat stream API with moderation + credit deduction + SSE | Done |
| Companion creation wizard (6-step, full schema coverage) | Done |
| Companion memory system with versioning | Done |
| Credit wallet + full transaction ledger | Done |
| Credit reservation system for async media | Done |
| Stripe subscription + credit pack checkout | Done |
| Stripe webhook handler | Done |
| Media generation APIs (image + video + job polling) | Done |
| Admin panel (users, models, plans, credit packs, pricing, moderation) | Done |
| Admin audit logging | Done |
| App shell components (Sidebar, Topbar, ChatInterface, etc.) | Done |
| Base UI component library (button, card, input, badge, textarea) | Done |
| Marketing pages (landing, pricing, privacy, terms, safety) | Done |
| Dev server running at http://localhost:3000 | Active |
