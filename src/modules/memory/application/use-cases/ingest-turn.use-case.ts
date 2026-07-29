import "server-only";
import type { Clock } from "@/shared/application/clock";
import { env } from "@/config/env";
import type { Embedder } from "../ports/embedder";
import type { FactExtractor } from "../ports/fact-extractor";
import type { MemoryStore } from "../ports/memory-store";
import type { RelationshipUpdater } from "../ports/relationship-updater";
import type { SessionSummarizer, SummarizerTurn } from "../ports/session-summarizer";

/**
 * IngestTurn — the post-turn write pipeline. Fire-and-forget from the
 * streaming route via Next 16's `after()`; the user has already seen their
 * assistant reply by the time this runs.
 *
 * Steps (all wrapped in try/catch so one failure doesn't cancel the rest):
 *
 *   1. Fact extraction (LLM, EXTRACTOR model) → persist to memory_facts
 *   2. Promote IDENTITY facts into user_profiles.structuredFacts
 *   3. Relationship state update (deterministic)
 *   4. Every N turns, refresh the session summary (LLM, SUMMARIZER model)
 */
export class IngestTurnUseCase {
  constructor(
    private readonly memoryStore: MemoryStore,
    private readonly extractor: FactExtractor,
    private readonly relationship: RelationshipUpdater,
    private readonly summarizer: SessionSummarizer,
    private readonly clock: Clock,
    /**
     * Nullable — semantic memory is opt-in per env (SEMANTIC_MEMORY_ENABLED)
     * and requires OPENAI_API_KEY. When null, facts are still persisted, but
     * their `embedding` column stays NULL and retrieval falls back to
     * lexical + entity + recency for those rows.
     */
    private readonly embedder: Embedder | null,
  ) {}

  async execute(input: {
    userId: string;
    characterId: string;
    characterName: string;
    conversationId: string;
    userMessage: string;
    assistantMessage: string;
    sourceUserMessageId: string | null;
    turnCountAfterIngest: number;
    recentTurnsForSummary?: readonly SummarizerTurn[];
  }): Promise<void> {
    if (!env.MEMORY_ENABLED) return;
    const now = this.clock.now();

    // 1 + 2: Extract + persist facts.
    let facts: Awaited<ReturnType<FactExtractor["extract"]>> = [];
    try {
      facts = await this.extractor.extract({
        characterName: input.characterName,
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage,
      });
      if (facts.length > 0) {
        // Embed each fact's `content` in a single batched call before the
        // insert. If the embedder isn't wired (semantic disabled or key
        // missing) or the call fails, we log and persist NULL vectors —
        // never let embedding failures block memory ingestion, since the
        // 3-signal retrieval remains fully functional without them.
        const embeddings = await embedFacts(this.embedder, facts);
        await this.memoryStore.insertFacts({
          userId: input.userId,
          characterId: input.characterId,
          sourceMessageId: input.sourceUserMessageId,
          drafts: facts,
          embeddings,
          now,
        });
        const identityPatch = collectIdentityPatch(facts);
        if (Object.keys(identityPatch).length > 0) {
          await this.memoryStore.upsertStructuredFacts({
            userId: input.userId,
            patch: identityPatch,
          });
        }
      }
    } catch (e) {
      console.warn("[memory] fact extraction failed", e);
    }

    // 3: Relationship update (deterministic; safe to always run).
    try {
      await this.relationship.updateFromTurn({
        userId: input.userId,
        characterId: input.characterId,
        facts,
        now,
      });
    } catch (e) {
      console.warn("[memory] relationship update failed", e);
    }

    // 4: Rolling session summary every N turns.
    if (
      input.turnCountAfterIngest > 0 &&
      input.turnCountAfterIngest % env.CHAT_SESSION_SUMMARY_EVERY_N_TURNS === 0 &&
      input.recentTurnsForSummary && input.recentTurnsForSummary.length > 0
    ) {
      try {
        const prior = await this.memoryStore.readSessionSummary(
          input.conversationId,
        );
        const summary = await this.summarizer.summarize({
          characterName: input.characterName,
          priorSummary: prior?.summary ?? null,
          turns: input.recentTurnsForSummary,
        });
        if (summary.trim().length > 0) {
          await this.memoryStore.upsertSessionSummary({
            conversationId: input.conversationId,
            summary,
            turnsCovered: input.turnCountAfterIngest,
          });
        }
      } catch (e) {
        console.warn("[memory] session summary failed", e);
      }
    }
  }
}

/**
 * Extracts stable-key facts from IDENTITY-category rows and returns a
 * patch object suitable for merging into `user_profiles.structuredFacts`.
 *
 * v1 uses lightweight regex heuristics — the extractor prompt is asked to
 * return `metadata.key` (e.g. "name", "birthday", "job") when a fact is
 * pinnable. Non-pinnable IDENTITY facts stay in memory_facts and surface
 * via retrieval.
 */
async function embedFacts(
  embedder: Embedder | null,
  facts: readonly { readonly content: string }[],
): Promise<(number[] | null)[] | undefined> {
  if (!embedder || facts.length === 0) return undefined;
  try {
    const texts = facts.map((f) => f.content);
    const vecs = await embedder.embed(texts);
    // Defensive: the provider should return an aligned array, but pad with
    // nulls if it doesn't so we never mis-align embedding <-> draft indexes.
    return facts.map((_, i) => (Array.isArray(vecs[i]) ? vecs[i]! : null));
  } catch (e) {
    console.warn("[memory] fact embedding failed, persisting without vectors", e);
    return facts.map(() => null);
  }
}

function collectIdentityPatch(
  facts: readonly {
    readonly category: string;
    readonly content: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of facts) {
    if (f.category !== "IDENTITY") continue;
    const key = f.metadata?.["key"];
    const value = f.metadata?.["value"];
    if (typeof key === "string" && key.length > 0 && value !== undefined) {
      patch[key] = value;
    }
  }
  return patch;
}
