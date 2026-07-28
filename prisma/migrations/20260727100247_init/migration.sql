-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Amorify — initial migration                                              │
-- │                                                                          │
-- │ 1. Install Postgres extensions required by the memory / search layers    │
-- │ 2. Create auth + profile tables                                          │
-- │ 3. Enable Row Level Security on every table (Supabase defense in depth)  │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ── 1. Extensions ────────────────────────────────────────────────────────────
-- Extensions are isolated in a dedicated `extensions` schema (Supabase best
-- practice — avoids the `0014_extension_in_public` advisor warning and keeps
-- the `public` schema for application-level objects only). Supabase's
-- `postgres` role has `extensions` on its `search_path` by default, so any
-- extension operator / function is callable without schema qualification.
--
-- All statements are idempotent so this migration is safe to replay.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS vector   WITH SCHEMA extensions;  -- pgvector: Layer 3a semantic search
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;  -- trigram fuzzy / keyword search
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;  -- accent-insensitive search

-- ── 2. Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- ── 3. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "ageConfirmedAt" TIMESTAMP(3),
    "tosAcceptedAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3),
    "contentPolicyAcceptedAt" TIMESTAMP(3),
    "signupIp" TEXT,
    "signupUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "timezone" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- ── 5. Foreign keys ──────────────────────────────────────────────────────────
ALTER TABLE "accounts"      ADD CONSTRAINT "accounts_userId_fkey"      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions"      ADD CONSTRAINT "sessions_userId_fkey"      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6. Row Level Security (Supabase best practice) ───────────────────────────
-- Every table in the `public` schema gets RLS enabled with NO policies. This
-- means the Supabase Data (REST) API — which uses the `anon` / `authenticated`
-- roles — cannot see any row, effectively denying public access.
--
-- The Prisma runtime connects as the `postgres` superuser (via the pooler)
-- and bypasses RLS, so application code is unaffected. When we later expose a
-- specific table to authenticated web clients, we'll add narrow policies
-- (`TO authenticated USING ((select auth.uid()) = user_id)`) in a separate
-- migration.

ALTER TABLE "users"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles"       ENABLE ROW LEVEL SECURITY;
