/**
 * Proves a generated photo becomes a retrievable memory.
 *
 * Writes the exact fact `MemoryGeneratedMediaRecorder` produces, then asks
 * the real hybrid searcher for it using wording that shares no keywords with
 * the stored text — so a hit can only come from the semantic signal, which is
 * what makes "remember that photo you sent" work days later.
 *
 * Cleans up after itself.
 *
 * Run: npx tsx --require ./scripts/_stub-server-only.cjs scripts/check-media-memory.ts
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

const SCENE =
  "She holds a green apple in one hand, lounging on the couch with her phone at arm's length for a selfie, warm lamp light behind her";

async function main() {
  const { RecordFactsUseCase } = await import(
    "../src/modules/memory/application/use-cases/record-facts.use-case"
  );
  const { PrismaMemoryStore } = await import(
    "../src/modules/memory/infrastructure/prisma-memory.store"
  );
  const { PgHybridSearcher } = await import(
    "../src/modules/memory/infrastructure/pg-hybrid.searcher"
  );
  const { ResolvedEmbedder } = await import(
    "../src/modules/memory/infrastructure/resolved-embedder"
  );
  const { OpenAIEmbeddingLlm } = await import(
    "../src/shared/infrastructure/llm/openai-embedding-llm"
  );
  const { PrismaModelConfigRepository } = await import(
    "../src/shared/infrastructure/model-config/prisma-model-config.repository"
  );
  const { SystemClock } = await import("../src/shared/application/clock");

  const conv = await prisma.conversation.findFirst({
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, userId: true, characterId: true },
  });
  if (!conv) return console.log("no conversation to test against");

  const models = new PrismaModelConfigRepository(prisma);
  const embedder = new ResolvedEmbedder(new OpenAIEmbeddingLlm(), models);
  const store = new PrismaMemoryStore(prisma);
  const clock = new SystemClock();

  const recordFacts = new RecordFactsUseCase(store, clock, embedder);
  const searcher = new PgHybridSearcher(prisma, embedder);

  const content = `Banana sent the user a photo: ${SCENE}`;
  const expiresAt = new Date(clock.nowMs() + 60 * 24 * 60 * 60 * 1000);

  const written = await recordFacts.execute({
    userId: conv.userId,
    characterId: conv.characterId,
    drafts: [
      {
        content,
        category: "EVENT",
        entities: ["Banana"],
        valence: 0.4,
        confidence: 1,
        metadata: { source: "media_generation", kind: "IMAGE" },
        expiresAt,
      },
    ],
  });
  console.log(`wrote ${written} fact(s)`);

  const row = await prisma.$queryRaw<Array<{ has_vec: boolean; expires: Date | null }>>`
    SELECT ("embedding" IS NOT NULL) AS has_vec, "expiresAt" AS expires
    FROM "memory_facts" WHERE "content" = ${content} LIMIT 1;
  `;
  console.log(
    row[0]?.has_vec
      ? "PASS  fact stored with an embedding (semantic search can reach it)"
      : "FAIL  fact stored WITHOUT an embedding",
  );
  console.log(
    row[0]?.expires
      ? `PASS  expiry set (${row[0].expires.toISOString().slice(0, 10)}) so photos decay`
      : "FAIL  no expiry — photo events would accumulate forever",
  );

  // Deliberately different vocabulary: no "apple", "couch", "selfie", "photo".
  for (const query of [
    "what was that picture you shared with me",
    "were you holding some fruit in that snap",
  ]) {
    const hits = await searcher.search({
      userId: conv.userId,
      characterId: conv.characterId,
      query,
      entities: [],
      limit: 5,
    });
    const found = hits.find((h) => h.content === content);
    console.log(
      `\n  query: ${JSON.stringify(query)}`,
      `\n  ${found ? `PASS  retrieved (rank ${hits.indexOf(found) + 1}/${hits.length}, score ${found.score.toFixed(2)})` : `FAIL  not in top ${hits.length}`}`,
    );
    for (const h of hits) {
      console.log(`      ${h.score.toFixed(2)}  [${h.category}] ${h.content.slice(0, 80)}`);
    }
  }

  // Idempotence: the same photo recorded twice must not duplicate.
  const again = await recordFacts.execute({
    userId: conv.userId,
    characterId: conv.characterId,
    drafts: [
      {
        content,
        category: "EVENT",
        entities: ["Banana"],
        valence: 0.4,
        confidence: 1,
        expiresAt,
      },
    ],
  });
  console.log(
    again === 0
      ? "\nPASS  re-recording the same photo wrote 0 rows"
      : `\nFAIL  re-record wrote ${again} row(s)`,
  );

  await prisma.$executeRaw`DELETE FROM "memory_facts" WHERE "content" = ${content};`;
  console.log("(test fact removed)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
