/**
 * Server-side public API for the memory module. Chat and route handlers
 * import from here. There is no client-side surface (memory is purely
 * server-driven).
 */

export type { MemoryFact, MemoryFactDraft, MemoryCategory } from "./domain/fact";
export type { SummarizerTurn } from "./application/ports/session-summarizer";

export { AssembleContextUseCase } from "./application/use-cases/assemble-context.use-case";
export { IngestTurnUseCase } from "./application/use-cases/ingest-turn.use-case";
export { RecordFactsUseCase } from "./application/use-cases/record-facts.use-case";

export {
  createAssembleContextUseCase,
  createIngestTurnUseCase,
  createRecordFactsUseCase,
} from "./composition/memory.dependencies";
