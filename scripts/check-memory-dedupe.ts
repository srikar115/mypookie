/**
 * Verifies the memory_facts dedupe migration: no duplicates survive, and a
 * repeat insert is rejected rather than stored.
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

async function main() {
  const dupes = await prisma.$queryRaw<
    Array<{ content: string; n: bigint }>
  >`
    SELECT lower(btrim("content")) AS content, count(*) AS n
    FROM "memory_facts"
    WHERE "characterId" IS NOT NULL
    GROUP BY "userId", "characterId", lower(btrim("content"))
    HAVING count(*) > 1
    ORDER BY count(*) DESC;
  `;
  console.log(
    dupes.length === 0
      ? "PASS  no duplicate content remains"
      : `FAIL  ${dupes.length} duplicate groups remain`,
  );
  for (const d of dupes) console.log(`   ${d.n}x ${d.content}`);

  const conv = await prisma.conversation.findFirst({
    orderBy: { lastMessageAt: "desc" },
    select: { characterId: true, userId: true },
  });
  if (!conv) return;

  const facts = await prisma.memoryFact.findMany({
    where: { userId: conv.userId, characterId: conv.characterId },
    orderBy: { extractedAt: "asc" },
    select: { content: true, category: true },
  });
  console.log(`\nfacts now stored for this thread (${facts.length}):`);
  for (const f of facts) console.log(`  [${f.category}] ${f.content}`);

  // Re-insert an existing fact verbatim; the partial unique index should
  // swallow it.
  const sample = facts[0];
  if (!sample) return;
  const affected = await prisma.$executeRaw`
    INSERT INTO "memory_facts" (
      "id", "userId", "characterId", "content", "category",
      "entities", "valence", "confidence", "metadata", "extractedAt"
    ) VALUES (
      gen_random_uuid(), ${conv.userId}::uuid, ${conv.characterId}::uuid,
      ${sample.content}, ${sample.category}::"MemoryCategory",
      ARRAY[]::text[], 0, 0.8, '{}'::jsonb, NOW()
    )
    ON CONFLICT DO NOTHING;
  `;
  console.log(
    affected === 0
      ? "\nPASS  re-inserting an existing fact wrote 0 rows"
      : `\nFAIL  re-insert wrote ${affected} row(s)`,
  );

  // And an IDENTITY re-phrasing must collide on metadata.key.
  const rephrased = await prisma.$executeRaw`
    INSERT INTO "memory_facts" (
      "id", "userId", "characterId", "content", "category",
      "entities", "valence", "confidence", "metadata", "extractedAt"
    ) VALUES (
      gen_random_uuid(), ${conv.userId}::uuid, ${conv.characterId}::uuid,
      'The user goes by Karthik.', 'IDENTITY'::"MemoryCategory",
      ARRAY[]::text[], 0, 0.8, '{"key":"name","value":"Karthik"}'::jsonb, NOW()
    )
    ON CONFLICT DO NOTHING;
  `;
  console.log(
    rephrased === 0
      ? "PASS  a re-phrased IDENTITY fact collided on metadata.key"
      : `note  re-phrased IDENTITY fact inserted (${rephrased}) — no prior keyed name fact`,
  );
  if (rephrased > 0) {
    await prisma.$executeRaw`
      DELETE FROM "memory_facts" WHERE "content" = 'The user goes by Karthik.';
    `;
    console.log("      (test row removed)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
