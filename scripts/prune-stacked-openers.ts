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
 *   - recycled greetings: assistant turns repeating text sent earlier in the
 *     thread verbatim (the tell-tale sign of the greeting loop); the first
 *     copy is kept, later ones go
 *   - contradicted refusals: a "I'd rather not share photos" reply sitting
 *     directly above the photo that was generated anyway. Left in place the
 *     model reads it as precedent and refuses every later request too.
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
  if (process.argv.includes("--all")) {
    const all = await prisma.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });
    for (const c of all) await prune(c.id);
    return;
  }

  const conversationId =
    convArg?.split("=")[1] ??
    (
      await prisma.conversation.findFirst({
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      })
    )?.id;
  if (!conversationId) return console.log("no conversation found");
  await prune(conversationId);
}

async function prune(conversationId: string) {
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
  // First time each line was said — anything later is a repeat.
  const firstSeen = new Map<string, string>();
  for (const r of assistantText) {
    const k = norm(r.content);
    if (!firstSeen.has(k)) firstSeen.set(k, r.id);
  }

  const REFUSAL =
    /\b(prefer to keep|rather not|not comfortable|won'?t be sharing|can'?t (share|send)|keep (things|it) (a bit )?(private|mysterious)|leave (something|a little) to the imagination)\b/i;

  const doomed: Array<{ id: string; why: string; at: Date; text: string }> = [];
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i];
    if (r.role !== "ASSISTANT") continue;
    if (r.content.trim().length === 0) continue; // media placeholder
    if (i === 0) continue; // the legitimate first-ever opener

    const prev = turns[i - 1];
    const next = turns[i + 1];
    const stacked = prev.role !== "USER";
    const recycled = firstSeen.get(norm(r.content)) !== r.id;
    // A refusal is only damage when the photo showed up regardless.
    const contradicted =
      REFUSAL.test(r.content) &&
      next?.role === "ASSISTANT" &&
      next.mediaGenerationId !== null;

    const why = [
      stacked && "stacked",
      recycled && "recycled",
      contradicted && "contradicted",
    ]
      .filter(Boolean)
      .join("+");
    if (!why) continue;

    doomed.push({
      id: r.id,
      why,
      at: r.createdAt,
      text: r.content.replace(/\s+/g, " ").slice(0, 64),
    });
  }

  if (doomed.length === 0) return console.log("clean.\n");

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
