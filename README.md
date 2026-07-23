# Amorify — AI Companion Platform

A production-ready MVP for an adult-only AI companion web app built with Next.js 16 App Router.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database**: PostgreSQL via Prisma 7 with driver adapters
- **Auth**: NextAuth v5 (credentials provider, JWT sessions)
- **AI**: Abstracted provider router (mock provider for MVP, ready for OpenAI/Anthropic)
- **Billing**: Credit wallet system (Stripe-ready architecture)
- **Storage**: Abstracted storage service (local dev / S3-ready)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` and fill in your values:

```bash
cp .env .env.local
```

Required:
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — Random secret for JWT signing
- `NEXTAUTH_URL` — Your app URL

### 3. Run database migrations

```bash
npx prisma migrate dev --name init
```

### 4. Seed the database

```bash
npm run db:seed
```

This seeds:
- Mock AI provider and models
- Default model assignments (chat/image/video)
- Pricing rules
- Plans (Free, Starter, Premium)
- App settings

### 5. Create an admin user

After running migrations, register via `/signup` then manually update the user role in your database:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your@email.com';
```

### 6. Start development server

```bash
npm run dev
```

## Project Structure

```
src/
├── app/
│   ├── (public)/          # Public marketing pages
│   ├── (auth)/            # Login & signup
│   ├── (app)/app/         # Protected user dashboard
│   ├── (admin)/admin/     # Admin dashboard
│   └── api/               # API routes
├── components/
│   ├── ui/                # Base UI components
│   ├── public/            # Public page components (Navbar, Footer)
│   ├── app/               # App shell (Sidebar, Topbar)
│   ├── companions/        # Companion wizard, memory editor
│   ├── chat/              # Chat interface
│   └── admin/             # Admin components
└── lib/
    ├── auth/              # NextAuth configuration
    ├── db/                # Prisma client
    ├── ai/                # Provider router, model registry, moderation
    ├── billing/           # Credit service, pricing service
    ├── companions/        # Companion service
    ├── memory/            # Memory service
    ├── storage/           # Storage service
    └── admin/             # Audit log service
```

## Key Architecture Decisions

### DB-Driven AI Models
All AI providers, models, and defaults are stored in the database. Admins can switch default chat/image/video models without code changes via `/admin/models`.

### Provider Router
All AI calls go through `src/lib/ai/providerRouter.ts`. The MVP uses a mock provider. Plug in OpenAI, Anthropic, or any other provider by adding a case to the router switch.

### Credit System
All credit changes go through `src/lib/billing/creditService.ts`. All pricing decisions go through `src/lib/billing/pricingService.ts`. Pricing is DB-driven and admin-configurable.

### Moderation
All user input is checked against `src/lib/ai/moderationService.ts` before processing. Pattern-based for MVP, with a clean interface to plug in AI moderation later.

## Plugging in Real AI Providers

1. Add provider to `ai_providers` table (or via admin UI)
2. Add models to `ai_models` table
3. Set as default in `model_defaults`
4. Add provider case in `src/lib/ai/providerRouter.ts`:

```typescript
case "openai":
  return openAiChatProvider(request, model);
```

## Enabling Stripe Billing

1. Add Stripe keys to `.env`
2. Create products/prices in Stripe
3. Update plan records with `stripeProductId` and `stripePriceId`
4. Implement webhook handler at `/api/webhooks/stripe`

## Safety

This platform enforces:
- 18+ age confirmation at signup (stored with timestamp)
- Content moderation on all user inputs
- Prohibited content blocking (minors, CSAM-adjacent, non-consensual)
- Admin moderation dashboard
- Full audit logging

## Database Commands

```bash
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # Seed initial data
npm run db:studio      # Open Prisma Studio
```
