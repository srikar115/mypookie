import "server-only";
import type { ServerContext } from "@/composition/server-context";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { EmbeddingLlm } from "@/shared/application/llm/embedding-llm";
import type { MemoryContextProvider } from "@/modules/chat";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { OpenAIEmbeddingLlm } from "@/shared/infrastructure/llm/openai-embedding-llm";
import { CachedEmbeddingLlm } from "@/shared/infrastructure/llm/cached-embedding-llm";
import redis from "@/shared/infrastructure/cache/redis";
import { env } from "@/config/env";
import { PrismaMemoryStore } from "../infrastructure/prisma-memory.store";
import { PgHybridSearcher } from "../infrastructure/pg-hybrid.searcher";
import { PrismaRelationshipStore } from "../infrastructure/prisma-relationship.store";
import { PromptedFactExtractor } from "../infrastructure/prompted-fact-extractor";
import { PromptedSessionSummarizer } from "../infrastructure/prompted-session-summarizer";
import { DeterministicRelationshipUpdater } from "../infrastructure/deterministic-relationship.updater";
import { ResolvedEmbedder } from "../infrastructure/resolved-embedder";
import { CachedMemoryContextProvider } from "../infrastructure/cached-memory-context.provider";
import type { Embedder } from "../application/ports/embedder";
import { AssembleContextUseCase } from "../application/use-cases/assemble-context.use-case";
import { IngestTurnUseCase } from "../application/use-cases/ingest-turn.use-case";

/**
 * Composition factories for the memory module. Wires the concrete Prisma /
 * OpenRouter / OpenAI-embeddings / deterministic implementations into use
 * cases.
 */

// Shared LLM adapter reused between EXTRACTOR + SUMMARIZER calls. Kept
// module-local (not on ServerContext) so its lifecycle mirrors memory's.
let sharedChatLlm: ChatLlm | null = null;
function getChatLlm(): ChatLlm {
  if (!sharedChatLlm) sharedChatLlm = new OpenRouterChatLlm();
  return sharedChatLlm;
}

// Same story for the embedding LLM: one HTTP client, reused. Nullable —
// resolves to null when semantic memory is disabled OR when we're missing
// the OpenAI key. The searcher + ingest use case both handle null
// gracefully so the chat continues working with the 3-signal formula
// (lexical + entity + recency) in that mode.
//
// The singleton is wrapped in `CachedEmbeddingLlm` so every embedding
// call (read path from `PgHybridSearcher.search`, write path from
// `IngestTurnUseCase.embedFacts`) goes through a shared Redis result
// cache. Cache key is content-addressed by (modelId, dimensions,
// sha256(text)); TTL is 7 days because embeddings are stable for a
// given model version. See `CachedEmbeddingLlm` docstring for details.
let sharedEmbeddingLlm: EmbeddingLlm | null | undefined = undefined;
function getEmbeddingLlm(): EmbeddingLlm | null {
  if (sharedEmbeddingLlm === undefined) {
    const base =
      env.SEMANTIC_MEMORY_ENABLED && !!env.OPENAI_API_KEY
        ? new OpenAIEmbeddingLlm()
        : null;
    sharedEmbeddingLlm = base ? new CachedEmbeddingLlm(base, redis) : null;
  }
  return sharedEmbeddingLlm;
}

function createEmbedder(ctx: ServerContext): Embedder | null {
  const llm = getEmbeddingLlm();
  return llm ? new ResolvedEmbedder(llm, ctx.models) : null;
}

/**
 * Builds the memory context provider used by chat + voice + opener.
 *
 * The concrete assembly (`AssembleContextUseCase`) is wrapped in
 * `CachedMemoryContextProvider` so the fully-composed memory block is
 * memoized in Redis for 60s per unique
 * (userId, characterId, conversationId, userMessage, displayName)
 * tuple. Between voice turns this eliminates the 200–600ms memory-
 * assembly cost when the same utterance recurs (openers, retries,
 * short repeats like "you there?"). Failure is fail-open — a Redis
 * outage transparently degrades to direct assembly.
 *
 * Return type narrowed to `MemoryContextProvider` because callers only
 * use the interface method (`getMemoryBlock`) — the decorator hides
 * the concrete class.
 */
export function createAssembleContextUseCase(
  ctx: ServerContext,
): MemoryContextProvider {
  const embedder = createEmbedder(ctx);
  const inner = new AssembleContextUseCase(
    new PrismaMemoryStore(ctx.db),
    new PgHybridSearcher(ctx.db, embedder),
    new PrismaRelationshipStore(ctx.db),
  );
  return new CachedMemoryContextProvider(inner, ctx.redis);
}

export function createIngestTurnUseCase(ctx: ServerContext): IngestTurnUseCase {
  const llm = getChatLlm();
  const memoryStore = new PrismaMemoryStore(ctx.db);
  const relStore = new PrismaRelationshipStore(ctx.db);
  const extractor = new PromptedFactExtractor(llm, ctx.models);
  const summarizer = new PromptedSessionSummarizer(llm, ctx.models);
  const relationship = new DeterministicRelationshipUpdater(relStore);
  const embedder = createEmbedder(ctx);
  return new IngestTurnUseCase(
    memoryStore,
    extractor,
    relationship,
    summarizer,
    ctx.clock,
    embedder,
  );
}
