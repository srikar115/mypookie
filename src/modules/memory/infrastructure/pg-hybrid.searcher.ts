import "server-only";
import type { MemoryCategory, PrismaClient } from "@prisma/client";
import type { HybridSearcher } from "../application/ports/hybrid-searcher";
import type { MemoryFact } from "../domain/fact";

interface RawRow {
  id: string;
  content: string;
  category: MemoryCategory;
  entities: string[] | null;
  valence: number;
  confidence: number;
  extracted_at: Date;
  score: number;
}

/**
 * PgHybridSearcher — one SQL query that scores facts by:
 *
 *   - BM25 approximation via `ts_rank_cd` over `to_tsvector('english', content)`
 *   - Entity overlap between the row and the query's inferred entities
 *   - Recency (weekly exponential decay)
 *
 * Tenancy is enforced in the WHERE (defense-in-depth on top of RLS). Facts
 * with `character_id IS NULL` (cross-companion memories, currently unused
 * but reserved) are included so shared facts about the user apply
 * everywhere. Expired rows are filtered.
 */
export class PgHybridSearcher implements HybridSearcher {
  constructor(private readonly db: PrismaClient) {}

  async search(input: {
    userId: string;
    characterId: string | null;
    query: string;
    entities: readonly string[];
    limit: number;
  }): Promise<MemoryFact[]> {
    const queryText = input.query.trim();
    if (queryText.length === 0) return [];

    const entities = [...input.entities];
    const characterId = input.characterId;

    const rows = await this.db.$queryRaw<RawRow[]>`
      SELECT
        "id",
        "content",
        "category",
        "entities",
        "valence",
        "confidence",
        "extractedAt" AS "extracted_at",
        (
          COALESCE(
            ts_rank_cd(to_tsvector('english', "content"), plainto_tsquery('english', ${queryText})),
            0
          ) * 2.0
          + CARDINALITY(
              ARRAY(
                SELECT UNNEST("entities")
                INTERSECT
                SELECT UNNEST(${entities}::text[])
              )
            ) * 1.5
          + EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - "extractedAt")), 0) / 604800.0)
        ) AS "score"
      FROM "memory_facts"
      WHERE "userId" = ${input.userId}::uuid
        AND (
          ${characterId}::uuid IS NULL
          OR "characterId" = ${characterId}::uuid
          OR "characterId" IS NULL
        )
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      ORDER BY "score" DESC, "extractedAt" DESC
      LIMIT ${input.limit};
    `;

    return rows
      .filter((r) => r.score > 0)
      .map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category,
        entities: r.entities ?? [],
        valence: Number(r.valence),
        confidence: Number(r.confidence),
        extractedAt: r.extracted_at,
        score: Number(r.score),
      }));
  }
}
