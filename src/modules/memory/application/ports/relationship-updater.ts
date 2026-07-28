import "server-only";
import type { MemoryFactDraft } from "../../domain/fact";
import type { RelationshipStateSnapshot } from "../dto/relationship-state.dto";

/**
 * RelationshipUpdater — turns "we just exchanged one turn" into an updated
 * (user, character) relationship row. Deterministic in v1: bumps counters,
 * nudges affinity based on aggregate valence of the freshly extracted
 * facts, and re-derives tier from totalMessages + affinity. When the
 * product grows richer signals (gifts, calls, dates) they land as new
 * inputs on this port.
 */
export interface RelationshipUpdater {
  updateFromTurn(input: {
    userId: string;
    characterId: string;
    facts: readonly MemoryFactDraft[];
    now: Date;
  }): Promise<RelationshipStateSnapshot>;
}
