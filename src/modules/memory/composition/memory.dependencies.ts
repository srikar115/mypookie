import "server-only";
import type { ServerContext } from "@/composition/server-context";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { EmbeddingLlm } from "@/shared/application/llm/embedding-llm";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { OpenAIEmbeddingLlm } from "@/shared/infrastructure/llm/openai-embedding-llm";
import { env } from "@/config/env";
import { PrismaMemoryStore } from "../infrastructure/prisma-memory.store";
import { PgHybridSearcher } from "../infrastructure/pg-hybrid.searcher";
import { PrismaRelationshipStore } from "../infrastructure/prisma-relationship.store";
import { PromptedFactExtractor } from "../infrastructure/prompted-fact-extractor";
import { PromptedSessionSummarizer } from "../infrastructure/prompted-session-summarizer";
import { DeterministicRelationshipUpdater } from "../infrastructure/deterministic-relationship.updater";
import { ResolvedEmbedder } from "../infrastructure/resolved-embedder";
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
let sharedEmbeddingLlm: EmbeddingLlm | null | undefined = undefined;
function getEmbeddingLlm(): EmbeddingLlm | null {
  if (sharedEmbeddingLlm === undefined) {
    sharedEmbeddingLlm =
      env.SEMANTIC_MEMORY_ENABLED && !!env.OPENAI_API_KEY
        ? new OpenAIEmbeddingLlm()
        : null;
  }
  return sharedEmbeddingLlm;
}

function createEmbedder(ctx: ServerContext): Embedder | null {
  const llm = getEmbeddingLlm();
  return llm ? new ResolvedEmbedder(llm, ctx.models) : null;
}

export function createAssembleContextUseCase(
  ctx: ServerContext,
): AssembleContextUseCase {
  const embedder = createEmbedder(ctx);
  return new AssembleContextUseCase(
    new PrismaMemoryStore(ctx.db),
    new PgHybridSearcher(ctx.db, embedder),
    new PrismaRelationshipStore(ctx.db),
  );
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
