import "server-only";
import { env } from "@/config/env";
import type { Clock } from "@/shared/application/clock";
import type { MemoryStore } from "../ports/memory-store";
import type { Embedder } from "../ports/embedder";
import type { MemoryFactDraft } from "../../domain/fact";

/**
 * Writes facts the caller already knows, without asking an LLM to find them.
 *
 * {@link IngestTurnUseCase} is the right entry point for a conversational
 * turn, where what matters is buried in prose and has to be extracted. It is
 * the wrong one for an event the application itself performed — a generated
 * photo, a completed call, a purchase. Two reasons:
 *
 *  1. The extractor is instructed "Do NOT extract facts about the AI
 *     companion — only the user", so a fact about what *she* sent is
 *     discarded by design.
 *  2. It costs an LLM round trip to rediscover something the caller could
 *     simply state.
 *
 * Embedding still happens, so these facts are reachable by semantic search
 * ("that beach photo you sent") and not merely by keyword. Deduplication is
 * the store's job — repeats collapse against the partial unique indexes.
 */
export class RecordFactsUseCase {
  constructor(
    private readonly memoryStore: MemoryStore,
    private readonly clock: Clock,
    /** Null when semantic memory is disabled; facts persist without vectors. */
    private readonly embedder: Embedder | null,
  ) {}

  async execute(input: {
    userId: string;
    characterId: string;
    sourceMessageId?: string | null;
    drafts: readonly MemoryFactDraft[];
  }): Promise<number> {
    if (!env.MEMORY_ENABLED) return 0;
    if (input.drafts.length === 0) return 0;

    const embeddings = await this.embed(input.drafts);

    return this.memoryStore.insertFacts({
      userId: input.userId,
      characterId: input.characterId,
      sourceMessageId: input.sourceMessageId ?? null,
      drafts: input.drafts,
      embeddings,
      now: this.clock.now(),
    });
  }

  private async embed(
    drafts: readonly MemoryFactDraft[],
  ): Promise<(number[] | null)[] | undefined> {
    if (!this.embedder) return undefined;
    try {
      const vecs = await this.embedder.embed(drafts.map((d) => d.content));
      return drafts.map((_, i) => (Array.isArray(vecs[i]) ? vecs[i]! : null));
    } catch (e) {
      // Same posture as ingest: a missing vector degrades retrieval to the
      // three lexical signals, it does not justify losing the fact.
      console.warn("[memory] fact embedding failed, persisting without vectors", e);
      return drafts.map(() => null);
    }
  }
}
