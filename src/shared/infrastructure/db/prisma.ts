import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/config/env";

/**
 * Prisma client singleton — the sole DB entry point for the entire app.
 *
 * Wrapped with `PrismaPg` so runtime queries flow through the Supabase
 * Transaction pooler (port 6543). Migrations use the Session pooler via
 * `DIRECT_URL` and are configured in `prisma.config.ts`.
 *
 * Stashed on `globalThis` so Next.js hot reloads don't spawn a new client
 * every render.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
