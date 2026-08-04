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

async function main() {
  const conv = await prisma.conversation.findFirst({
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, characterId: true, userId: true },
  });
  if (!conv) return console.log("no conversations");

  const rows = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { role: true, content: true, modelId: true, createdAt: true },
  });
  console.log("last 8 messages (oldest first):\n");
  for (const r of rows.reverse()) {
    console.log(
      `${r.createdAt.toISOString().slice(11, 19)} ${r.role.padEnd(9)} model=${r.modelId ?? "-"}`,
    );
    console.log(`   ${JSON.stringify(r.content.slice(0, 150))}`);
  }

  const ch = await prisma.character.findUnique({
    where: { id: conv.characterId },
    select: {
      name: true,
      systemPrompt: true,
      tagline: true,
      relationshipArchetype: { select: { displayName: true } },
      personalityArchetype: { select: { displayName: true } },
    },
  });
  console.log(
    `\n─── character: ${ch?.name} | ${ch?.relationshipArchetype.displayName} | ${ch?.personalityArchetype.displayName} ───`,
  );
  console.log("\n─── character.systemPrompt ───");
  console.log(ch?.systemPrompt ?? "(none)");

  const facts = await prisma.memoryFact.findMany({
    where: { userId: conv.userId, characterId: conv.characterId },
    orderBy: { extractedAt: "desc" },
    take: 15,
    select: { content: true, category: true, extractedAt: true },
  });
  console.log(`\n─── memory facts (${facts.length}) ───`);
  for (const f of facts) {
    console.log(`  [${f.category}] ${f.content.slice(0, 110)}`);
  }

  const summary = await prisma.conversationSummary.findUnique({
    where: { conversationId: conv.id },
    select: { summary: true, turnsCovered: true },
  });
  console.log("\n─── conversation summary ───");
  console.log(
    summary ? `turns=${summary.turnsCovered}\n${summary.summary}` : "(none)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
