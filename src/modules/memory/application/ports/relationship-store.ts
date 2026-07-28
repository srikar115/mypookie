import "server-only";
import type {
  RelationshipStateSnapshot,
  RelationshipTier,
} from "../dto/relationship-state.dto";

/**
 * RelationshipStore — persistence for the (user, character) affinity row.
 * Split from {@link MemoryStore} because the update path is deterministic
 * (no LLM in the loop) and the read path is a hot-path prompt input.
 */
export interface RelationshipStore {
  read(input: {
    userId: string;
    characterId: string;
  }): Promise<RelationshipStateSnapshot | null>;

  upsertOnTurn(input: {
    userId: string;
    characterId: string;
    valenceDelta: number;
    tier: RelationshipTier | null;
    now: Date;
  }): Promise<RelationshipStateSnapshot>;
}
