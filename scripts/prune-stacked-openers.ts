/**
 * One-off repair for threads polluted by the pre-policy opener bug.
 *
 * Before `domain/opener-policy.ts` existed, the opener route generated a
 * greeting every time it was called and persisted it. Threads accumulated
 * unanswered greetings, and once recent history was mostly greetings the
 * model imitated the pattern and answered every message with one too.
 *
 * This removes the damage so the model sees a clean thread again:
 *   - stacked openers: assistant turns with no user turn before them
 *   - recycled greetings: assistant turns whose text is repeated verbatim
 *     elsewhere in the thread (the tell-tale sign of the greeting loop)
 *
 * The conversation's first message is always kept — that opener is
 * legitimate. User messages and media are never touched.
 *
 * Dry run by default. Pass --apply to delete.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({
  adapter,
} as ConstructorParameters<typeof PrismaClient>[0]);

const APPLY = process.argv.includes("--apply");
const convArg = process.argv.find((a) => a.startsWith("--conversation="));

/** Same normalization the opener route's duplicate check uses. */
function norm(s: string): string {
  return s
    .replace(/\*[^*\n]{1,200}\*/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const conversationId =
    convArg?.split("=")[1] ??
    (
      await prisma.conversation.findFirst({
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      })
    )?.id;
  if (!conversationId) return console.log("no conversation found");

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      mediaGenerationId: true,
      createdAt: true,
    },
  });
  console.log(`conversation ${conversationId} — ${rows.length} messages\n`);

  const turns = rows.filter((r) => r.role === "USER" || r.role === "ASSISTANT");

  // Assistant turns carrying real text (media placeholders are empty).
  const assistantText = turns.filter(
    (r) => r.role === "ASSISTANT" && r.content.trim().length > 0,
  );
  const counts = new Map<string, number>();
  for (const r of assistantText) {
    const k = norm(r.content);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const doomed: Array<{ id: string; why: string; at: Date; text: string }> = [];
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i];
    if (r.role !== "ASSISTANT") continue;
    if (r.content.trim().length === 0) continue; // media placeholder
    if (i === 0) continue; // the legitimate first-ever opener

    const prev = turns[i - 1];
    const stacked = prev.role !== "USER";
    const recycled = (counts.get(norm(r.content)) ?? 0) > 1;
    if (!stacked && !recycled) continue;

    doomed.push({
      id: r.id,
      why: stacked && recycled ? "stacked+recycled" : stacked ? "stacked" : "recycled",
      at: r.createdAt,
      text: r.content.replace(/\s+/g, " ").slice(0, 64),
    });
  }

  console.log(`${doomed.length} assistant greetings to remove:\n`);
  for (const d of doomed) {
    console.log(
      `  ${d.at.toISOString().slice(11, 19)}  ${d.why.padEnd(16)} "${d.text}"`,
    );
  }

  const keeping = rows.length - doomed.length;
  console.log(`\n${keeping} messages would remain (user turns + media untouched).`);

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to delete.");
    return;
  }

  const res = await prisma.message.deleteMany({
    where: { id: { in: doomed.map((d) => d.id) } },
  });
  console.log(`\ndeleted ${res.count} messages.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
