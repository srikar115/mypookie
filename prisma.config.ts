// Prisma configuration. Loaded by the Prisma CLI (migrate, generate, db push).
//
// Why DIRECT_URL, not DATABASE_URL?
//   - DATABASE_URL points to the Supabase Transaction pooler (port 6543) which
//     runs pgBouncer in transaction mode. That mode does not support the
//     advisory locks, prepared statements, and multi-statement transactions
//     that `prisma migrate` relies on. Using it here would cause silent
//     failures ("prepared statement already exists", stalled migrations, etc.).
//   - DIRECT_URL points to the Session pooler (port 5432) which behaves like
//     a plain Postgres connection and is safe for schema operations.
//   - The application runtime uses DATABASE_URL directly via
//     @prisma/adapter-pg in src/lib/db/index.ts, so no code path is affected
//     by this file at runtime.
import { config } from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(__dirname, ".env"), override: true });

const migrationsUrl =
  process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];

if (!migrationsUrl) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. " +
      "Add DIRECT_URL (Supabase Session pooler, port 5432) to your .env " +
      "before running any Prisma CLI command.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationsUrl,
  },
});
