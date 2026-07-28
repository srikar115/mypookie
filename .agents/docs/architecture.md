# Amorify — Architecture

> **This file describes the *target* architecture.** For the enforceable short version see [`.cursor/rules/architecture.mdc`](../../.cursor/rules/architecture.mdc). For the full blueprint (with rationale, examples, and migration plan) see [`nextjs_fullstack_solid_modular_architecture.docx`](./nextjs_fullstack_solid_modular_architecture.docx).

---

## Overview

Amorify is an AI companion web application built as a **modular monolith**: one Next.js deployable, separated internally into feature modules with clean layer boundaries. Business rules live in framework-independent code; Next.js, Prisma, Stripe, OpenAI, and R2 live at the edges.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Language | TypeScript 5.9 (strict) |
| UI | React 19, Tailwind CSS v4, Radix UI primitives, Lucide icons, framer-motion |
| Database | PostgreSQL 15+ (Supabase) via `pg` + `@prisma/adapter-pg` |
| Extensions | `pgvector`, `pg_trgm`, `pgcrypto`, `unaccent` (in `extensions` schema) |
| ORM | Prisma 7 |
| Cache / queue | Redis (Redis Cloud) via `ioredis` |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` |
| Auth | NextAuth v5 + `@auth/prisma-adapter` |
| Payments | Stripe (integration pending) |
| AI | OpenAI, Anthropic, Stability AI, Runway, Kling, Fal.ai (provider-routed, pending) |
| Validation | Zod v4 |
| State | Zustand + TanStack React Query (client) |

## Dependency direction

```
app + presentation  →  application  →  domain
                                       ↑
                    infrastructure  ───┘   (implements domain/application interfaces)
```

Domain never points outward. Application never imports Next.js, React, Prisma, or provider SDKs. Infrastructure is replaceable.

## Directory contract

```
src/
├── app/                              # routing + composition only
│   ├── (public)/                     # marketing homepage + legal pages
│   ├── api/auth/[...nextauth]/       # NextAuth route handler
│   ├── layout.tsx
│   ├── globals.css
│   └── ...
├── components/                       # legacy UI primitives (will migrate to shared/presentation/)
│   ├── public/                       # marketing shell + homepage sections
│   └── ui/                           # design-system atoms (Button, Card, Input, …)
├── modules/                          # business capabilities — the primary org unit
│   └── identity/                     # (currently only NextAuth wiring — full layers land with signup/age-gate use cases)
│       ├── infrastructure/
│       │   ├── nextauth.ts           # server-only NextAuth setup (Prisma adapter, credentials provider)
│       │   └── nextauth-config.ts    # edge-safe config (used by middleware)
│       └── index.ts                  # public API — only path other modules may import
├── shared/                           # cross-cutting building blocks (no feature ownership)
│   ├── application/
│   │   ├── result.ts                 # Result<T, E> + ok/err helpers
│   │   ├── clock.ts                  # Clock port + SystemClock / FixedClock
│   │   └── id-generator.ts           # IdGenerator port + UuidGenerator / SequenceIdGenerator
│   ├── domain/                       # (empty — reserved for cross-cutting value objects)
│   ├── infrastructure/
│   │   ├── db/prisma.ts              # Prisma singleton (env-driven, hot-reload safe)
│   │   ├── cache/redis.ts            # ioredis singleton
│   │   ├── storage/r2.ts             # Cloudflare R2 adapter (uploadBuffer, signed URLs, delete)
│   │   └── startup/preflight.ts      # boot-time Postgres/extensions/Redis checks
│   └── presentation/
│       ├── utils.ts                  # cn(), formatDate, timeAgo, …
│       └── animations.ts             # framer-motion presets
├── composition/
│   └── server-context.ts             # getServerContext() — actor + shared infra bundle
├── config/
│   └── env.ts                        # Zod-validated env schema — ONLY place that reads process.env
└── instrumentation.ts                # Next.js register() hook → runPreflight()

prisma/
├── schema.prisma                     # minimal auth-only schema (users, accounts, sessions, verification_tokens, user_profiles)
├── migrations/
│   └── 20260727100247_init/          # extensions in isolated schema + tables + RLS on every table
└── seed.ts

.agents/docs/
├── architecture.md                   # this file
├── nextjs_fullstack_solid_modular_architecture.docx  # the full blueprint (source of truth)
├── memory-architecture.md            # 3-layer chat memory design
├── product-research.md               # market/competitor research on AI companion apps
└── schema.md                         # migration-by-migration schema changelog
```

## Environment access

- `src/config/env.ts` is the **only** place that reads `process.env.*`.
- The ESLint rule `no-restricted-properties` in `eslint.config.mjs` will fail the build on violations everywhere else.
- The one exception is `src/instrumentation.ts`, which needs to check `NEXT_RUNTIME` before it can safely import the env module.

## Per-layer contracts

See section 5 of the blueprint (`.agents/docs/nextjs_fullstack_solid_modular_architecture.docx`) and the summarized version in `.cursor/rules/architecture.mdc`. In short:

- **`app/`** — read transport, validate transport shape, call `getServerContext()`, call **one** use case, map result.
- **Application** — orchestrate a workflow, own transactions, return `Result<T, E>`.
- **Domain** — plain TypeScript, enforce invariants.
- **Infrastructure** — implement inward-facing ports.
- **Composition** — the only layer that knows both interfaces and concretes.

## Architecture rules enforced in CI

Configured in `eslint.config.mjs`:

1. `no-restricted-properties` on `process.env` — direct env access banned outside `config/env.ts` + `instrumentation.ts`.
2. `no-restricted-imports` on `@/lib/*` — the old flat namespace is dead; imports must resolve to `@/shared/*`, `@/modules/*`, `@/config/*`, or `@/composition/*`.
3. `no-restricted-imports` on `@/modules/*/{domain,application,infrastructure,presentation,composition}/*` — no deep module imports; use the module's `index.ts` public API.
4. Domain layer cannot import `next/*`, `react`, `@prisma/client`, provider SDKs, infrastructure, presentation, or composition.
5. Application layer cannot import `next/*`, `react`, `@prisma/client`, or concrete infrastructure.
6. `app/` cannot import `@prisma/client`, provider SDKs, or module internals.
7. `components/` cannot import server-only modules (`config/env`, infrastructure, `next-auth`, `pg`, `ioredis`, AWS SDK).

## Adding a new feature

1. Create `src/modules/<feature>/` with `domain/`, `application/`, `infrastructure/`, `presentation/`, `composition/`, `index.ts`.
2. Model the domain: entities, value objects, domain errors.
3. Declare repository + port interfaces in `application/`.
4. Write use cases against those interfaces — no framework imports.
5. Implement repositories + adapters in `infrastructure/`.
6. Add a composition factory in `composition/` wiring everything via `ServerContext`.
7. Add Server Actions / Route Handlers in `presentation/` (or `app/`) that call the use case exactly once.
8. Export the public surface from `index.ts`.
9. Add unit tests (domain + use case with in-memory repos) and integration tests (Prisma mapping, transactions).
10. Run `npm run lint` — the boundary rules will catch forbidden imports.

## Current state (2026-07-27)

The codebase is intentionally minimal:

- **Homepage** — candy.ai-style marketing page under `src/app/(public)/`, composed of client-side interactive sections (HeroCarousel, CharacterAvatars, CharactersGrid, FAQSection, InfoSections, CreateCTA) and a `PublicShell` layout with sidebar + topbar + login modal.
- **Auth** — NextAuth v5 credentials provider wired to Prisma. No `/login` or `/signup` pages yet — auth happens through the `LoginModal` on the homepage.
- **DB** — Supabase Postgres with `pgvector`, `pg_trgm`, `pgcrypto`, `unaccent` in an isolated `extensions` schema. Row-Level Security enabled on every table.
- **Preflight** — server startup verifies DB reachable, all four extensions installed, migration table present, Redis reachable + ping/canary roundtrip.

The following modules are **planned** and will be built one at a time following the module template above:

- `chat` — conversation orchestration, streaming, moderation, credit debit
- `memory` — 3-layer memory (working / session / long-term) — see `memory-architecture.md`
- `companions` — character creation, presets, wizard
- `credits` — balance, ledger, transactions
- `billing` — Stripe subscriptions, webhooks, entitlements
- `moderation` — content policy, age gate, safety filters
- `generations` — image/video generation via provider adapters
- `media` — R2 upload orchestration, signed URLs, cleanup jobs
- `administration` — moderator tools, audit log
