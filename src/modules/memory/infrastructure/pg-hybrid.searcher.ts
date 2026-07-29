import "server-only";
import type { MemoryCategory, PrismaClient } from "@prisma/client";
import { env } from "@/config/env";
import type { HybridSearcher } from "../application/ports/hybrid-searcher";
import type { Embedder } from "../application/ports/embedder";
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
 * PgHybridSearcher — one SQL query that scores facts by four signals:
 *
 *   1. Lexical relevance — `ts_rank_cd` over `to_tsvector('english', content)`
 *      (BM25-like ranking against a `plainto_tsquery` of the user's message)
 *   2. Entity overlap   — cardinality of shared proper nouns between the row
 *      and the user turn (heuristic on read, LLM-derived on write)
 *   3. Recency          — weekly exponential decay on `extractedAt`
 *   4. Semantic         — `1 - (embedding <=> queryVec)` cosine similarity,
 *      contributing only when both the fact and query have embeddings
 *
 * Weights live in `env.HYBRID_*_WEIGHT` so admins can retune the mix
 * without a code change. The `SEMANTIC_MEMORY_ENABLED` flag + presence of
 * an {@link Embedder} in the constructor together decide whether the
 * fourth term is evaluated at all — if the embedder is null we skip both
 * the round trip and the SQL cost.
 *
 * The vector column is compared with the `<=>` operator (cosine distance,
 * matching the HNSW index's `vector_cosine_ops`). Rows with a NULL
 * embedding contribute 0 to the semantic term via COALESCE, so they still
 * surface on the strength of lexical/entity/recency — a graceful path
 * during the backfill window right after the embedder ships.
 *
 * Tenancy is enforced in the WHERE (defense-in-depth on top of RLS). Facts
 * with `character_id IS NULL` (cross-companion memories, reserved) are
 * included so shared facts about the user apply everywhere. Expired rows
 * are filtered.
 */
export class PgHybridSearcher implements HybridSearcher {
  constructor(
    private readonly db: PrismaClient,
    private readonly embedder: Embedder | null,
  ) {}

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

    // Best-effort query embedding. If the embedder is missing or the call
    // fails, we degrade to the 3-signal formula rather than break search.
    const queryVector = await this.embedQuery(queryText);
    const semanticLiteral = queryVector ? toPgVectorLiteral(queryVector) : null;
    const semanticWeight = queryVector ? env.HYBRID_SEMANTIC_WEIGHT : 0;

    // Weight params are cast to `double precision` explicitly. Reason: the
    // Prisma pg driver adapter sends JS numbers to Postgres as untyped
    // parameters; when the other side of `*` is an integer expression
    // (e.g. `CARDINALITY(...)`), Postgres tries to coerce "1.5" into
    // `integer` and fails with 22P02. The cast pins each parameter to
    // double so the multiplication picks the numeric-preferring path.
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
          ) * ${env.HYBRID_LEXICAL_WEIGHT}::double precision
          + CARDINALITY(
              ARRAY(
                SELECT UNNEST("entities")
                INTERSECT
                SELECT UNNEST(${entities}::text[])
              )
            ) * ${env.HYBRID_ENTITY_WEIGHT}::double precision
          + EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - "extractedAt")), 0) / 604800.0)
            * ${env.HYBRID_RECENCY_WEIGHT}::double precision
          + COALESCE(
              (1 - ("embedding" <=> ${semanticLiteral}::vector))
              * ${semanticWeight}::double precision,
              0
            )
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

  private async embedQuery(text: string): Promise<number[] | null> {
    if (!this.embedder) return null;
    try {
      const [vec] = await this.embedder.embed([text]);
      return Array.isArray(vec) && vec.length > 0 ? vec : null;
    } catch (e) {
      console.warn("[memory] query embedding failed, falling back to 3-signal", e);
      return null;
    }
  }
}

function toPgVectorLiteral(v: readonly number[]): string {
  const parts = new Array<string>(v.length);
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    parts[i] = Number.isFinite(x) ? x.toString() : "0";
  }
  return `[${parts.join(",")}]`;
}
