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
    now: Date;
  }): Promise<number> {
    if (input.drafts.length === 0) return 0;
    const rows = input.drafts.map((d) => ({
      userId: input.userId,
      characterId: input.characterId,
      sourceMessageId: input.sourceMessageId,
      content: d.content,
      category: d.category,
      entities: [...d.entities],
      valence: clamp(d.valence, -1, 1),
      confidence: clamp(d.confidence, 0, 1),
      metadata: (d.metadata ?? {}) as object,
      extractedAt: input.now,
      expiresAt: d.expiresAt ?? null,
    }));
    const res = await this.db.memoryFact.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return res.count;
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

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
