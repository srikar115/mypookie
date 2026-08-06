/**
 * Shows call sessions the app still considers live, and optionally reaps the
 * abandoned ones through the same repository method `StartCallUseCase` uses.
 *
 * A row with `endedAt = null` blocks that user from starting any new call, so
 * one missed hang-up (killed tab, LiveKit unable to reach our webhook) locks
 * calling permanently until something clears it.
 *
 * Pass --reap to close everything silent for longer than the timeout.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaCallSessionRepository } from "../src/modules/voice/infrastructure/prisma-call-session.repository";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
} as ConstructorParameters<typeof PrismaClient>[0]);

// Mirrors CALL_SILENCE_TIMEOUT_MS in start-call.use-case.ts.
const SILENCE_TIMEOUT_MS = 3 * 60 * 1000;

async function main() {
  const total = await prisma.callSession.count();
  const open = await prisma.callSession.findMany({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  console.log(`${total} call sessions total, ${open.length} still open\n`);

  const now = new Date();
  for (const r of open) {
    const silentMin = Math.round((now.getTime() - r.updatedAt.getTime()) / 60000);
    const ageMin = Math.round((now.getTime() - r.startedAt.getTime()) / 60000);
    const verdict =
      now.getTime() - r.updatedAt.getTime() > SILENCE_TIMEOUT_MS
        ? "ABANDONED"
        : "live";
    console.log(
      `  ${r.startedAt.toISOString()}  age=${String(ageMin).padStart(5)}min  silent=${String(silentMin).padStart(5)}min  turns=${r.turnCount}  ${verdict}`,
    );
  }

  if (open.length === 0) return;
  if (!process.argv.includes("--reap")) {
    console.log("\nre-run with --reap to close the abandoned ones.");
    return;
  }

  const repo = new PrismaCallSessionRepository(prisma);
  const userIds = [...new Set(open.map((r) => r.userId))];
  let closed = 0;
  for (const userId of userIds) {
    closed += await repo.reapAbandonedByUser({
      userId,
      silentSince: new Date(now.getTime() - SILENCE_TIMEOUT_MS),
      now,
    });
  }

  const stillOpen = await prisma.callSession.count({ where: { endedAt: null } });
  console.log(`\nreaped ${closed} across ${userIds.length} user(s); ${stillOpen} still open.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
