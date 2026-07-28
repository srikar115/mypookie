import "server-only";
import type { ServerContext } from "@/composition/server-context";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { PrismaMemoryStore } from "../infrastructure/prisma-memory.store";
import { PgHybridSearcher } from "../infrastructure/pg-hybrid.searcher";
import { PrismaRelationshipStore } from "../infrastructure/prisma-relationship.store";
import { PromptedFactExtractor } from "../infrastructure/prompted-fact-extractor";
import { PromptedSessionSummarizer } from "../infrastructure/prompted-session-summarizer";
import { DeterministicRelationshipUpdater } from "../infrastructure/deterministic-relationship.updater";
import { AssembleContextUseCase } from "../application/use-cases/assemble-context.use-case";
import { IngestTurnUseCase } from "../application/use-cases/ingest-turn.use-case";

/**
 * Composition factories for the memory module. Wires the concrete Prisma /
 * OpenRouter / deterministic implementations into use cases. When the
 * embedder + vector search land, this file grows a new adapter for the
 * embedding column — everything else stays put.
 */

// Shared LLM adapter reused between EXTRACTOR + SUMMARIZER calls. Kept
// module-local (not on ServerContext) so its lifecycle mirrors memory's.
let sharedChatLlm: ChatLlm | null = null;
function getChatLlm(): ChatLlm {
  if (!sharedChatLlm) sharedChatLlm = new OpenRouterChatLlm();
  return sharedChatLlm;
}

export function createAssembleContextUseCase(
  ctx: ServerContext,
): AssembleContextUseCase {
  return new AssembleContextUseCase(
    new PrismaMemoryStore(ctx.db),
    new PgHybridSearcher(ctx.db),
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
  return new IngestTurnUseCase(
    memoryStore,
    extractor,
    relationship,
    summarizer,
    ctx.clock,
  );
}
