import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { MemoryStore } from "../application/ports/memory-store";
import type { MemoryFactDraft } from "../domain/fact";

/**
 * Prisma-backed adapter. Uses `createMany` for bulk fact inserts and a
 * jsonb `||` merge (via raw SQL) for the structuredFacts patch so we don't
 * overwrite unrelated keys.
 */
export class PrismaMemoryStore implements MemoryStore {
  constructor(private readonly db: PrismaClient) {}

  async insertFacts(input: {
    userId: string;
    characterId: string;
    sourceMessageId: string | null;
    drafts: readonly MemoryFactDraft[];
    embeddings?: readonly (readonly number[] | null)[];
    now: Date;
  }): Promise<number> {
    if (input.drafts.length === 0) return 0;

    const drafts = dedupeDrafts(input.drafts);

    // Raw SQL (instead of `createMany`) because Prisma has no first-class
    // type for pgvector — `memory_facts.embedding` is Unsupported("vector(1024)").
    // We serialize each vector as a pgvector text literal (`[v1,v2,...]`) and
    // cast in-SQL; NULL literal for facts we didn't embed. One INSERT per
    // draft keeps the code straightforward and turns emit ≤ 4 facts, so the
    // per-turn round-trip cost is negligible against the LLM call preceding it.
    let inserted = 0;
    for (const { draft: d, index: i } of drafts) {
      const rawEmbedding = input.embeddings?.[i] ?? null;
      const embeddingLiteral = toPgVectorLiteral(rawEmbedding);
      const entities = [...d.entities];
      const valence = clamp(d.valence, -1, 1);
      const confidence = clamp(d.confidence, 0, 1);
      const metadata = JSON.stringify(d.metadata ?? {});

      const affected = await this.db.$executeRaw`
        INSERT INTO "memory_facts" (
          "id", "userId", "characterId", "sourceMessageId", "content",
          "category", "entities", "valence", "confidence", "metadata",
          "extractedAt", "expiresAt", "embedding"
        ) VALUES (
          gen_random_uuid(),
          ${input.userId}::uuid,
          ${input.characterId}::uuid,
          ${input.sourceMessageId}::uuid,
          ${d.content},
          ${d.category}::"MemoryCategory",
          ${entities}::text[],
          ${valence}::double precision,
          ${confidence}::double precision,
          ${metadata}::jsonb,
          ${input.now},
          ${d.expiresAt ?? null},
          ${embeddingLiteral}::vector
        )
        ON CONFLICT DO NOTHING;
      `;
      inserted += Number(affected);
    }
    return inserted;
  }

  async upsertStructuredFacts(input: {
    userId: string;
    patch: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    // `user_profiles.structuredFacts` is jsonb — merge with the DB-side
    // `||` operator so this is one round trip and preserves keys we don't
    // touch. If no user_profiles row exists, create it with just the patch.
    await this.db.$executeRaw`
      INSERT INTO "user_profiles" ("id", "userId", "structuredFacts", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${input.userId}::uuid, ${JSON.stringify(input.patch)}::jsonb, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
        SET "structuredFacts" = "user_profiles"."structuredFacts" || EXCLUDED."structuredFacts",
            "updatedAt" = NOW();
    `;
  }

  async readStructuredFacts(userId: string): Promise<Record<string, unknown>> {
    const row = await this.db.userProfile.findUnique({
      where: { userId },
      select: { structuredFacts: true },
    });
    if (!row || !row.structuredFacts) return {};
    if (typeof row.structuredFacts === "object" && !Array.isArray(row.structuredFacts)) {
      return row.structuredFacts as Record<string, unknown>;
    }
    return {};
  }

  async readSessionSummary(
    conversationId: string,
  ): Promise<{ summary: string; turnsCovered: number } | null> {
    const row = await this.db.conversationSummary.findUnique({
      where: { conversationId },
      select: { summary: true, turnsCovered: true },
    });
    return row ? { summary: row.summary, turnsCovered: row.turnsCovered } : null;
  }

  async upsertSessionSummary(input: {
    conversationId: string;
    summary: string;
    turnsCovered: number;
  }): Promise<void> {
    await this.db.conversationSummary.upsert({
      where: { conversationId: input.conversationId },
      update: { summary: input.summary, turnsCovered: input.turnsCovered },
      create: {
        conversationId: input.conversationId,
        summary: input.summary,
        turnsCovered: input.turnsCovered,
      },
    });
  }
}

/**
 * Collapses repeats inside a single extraction batch, keeping the first
 * occurrence and its index (the index is what aligns a draft with its
 * embedding).
 *
 * The database enforces the same rule across turns via two partial unique
 * indexes plus `ON CONFLICT DO NOTHING`. This pass exists because a single
 * batch can conflict with *itself*, and an intra-statement conflict is not
 * something `ON CONFLICT` can resolve — it would just silently drop the
 * second row after paying for its embedding.
 *
 * Matching mirrors the indexes exactly: normalized content, and for IDENTITY
 * facts the `metadata.key` attribute, so "the user is named X" and "the
 * user's name is X" count as one.
 */
function dedupeDrafts(
  drafts: readonly MemoryFactDraft[],
): Array<{ draft: MemoryFactDraft; index: number }> {
  const seen = new Set<string>();
  const out: Array<{ draft: MemoryFactDraft; index: number }> = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const keys = [`c:${draft.content.trim().toLowerCase()}`];
    const identityKey =
      draft.category === "IDENTITY" ? draft.metadata?.key : undefined;
    if (typeof identityKey === "string" && identityKey.length > 0) {
      keys.push(`i:${identityKey}`);
    }
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push({ draft, index: i });
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Serialize a `readonly number[]` into pgvector's text-literal form
 * `[v1,v2,...]`. Returns `null` (typed NULL in SQL) when the input is null
 * or empty. NaN / Infinity are coerced to 0 so a bad embedding row cannot
 * poison the batch — pgvector rejects those values with a hard error.
 */
function toPgVectorLiteral(v: readonly number[] | null): string | null {
  if (v === null || v.length === 0) return null;
  const parts = new Array<string>(v.length);
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    parts[i] = Number.isFinite(x) ? x.toString() : "0";
  }
  return `[${parts.join(",")}]`;
}
