import "server-only";
import type { RelationshipStore } from "../application/ports/relationship-store";
import type { RelationshipUpdater } from "../application/ports/relationship-updater";
import type { RelationshipStateSnapshot } from "../application/dto/relationship-state.dto";
import type { MemoryFactDraft } from "../domain/fact";

/**
 * Deterministic updater: no LLM in the loop. Averages the valence of the
 * turn's extracted facts (falling back to 0 if none), scales it into a
 * small delta on the (user, character) affinity axis, and lets the store
 * pick the tier.
 *
 * Weighting rationale:
 *   - Cap delta per-turn at ±2 so a single hostile message can't undo
 *     weeks of progress.
 *   - Emotion-category facts get weight 2; identity/preference get 1;
 *     everything else gets 0.5.
 */
export class DeterministicRelationshipUpdater implements RelationshipUpdater {
  constructor(private readonly store: RelationshipStore) {}

  async updateFromTurn(input: {
    userId: string;
    characterId: string;
    facts: readonly MemoryFactDraft[];
    now: Date;
  }): Promise<RelationshipStateSnapshot> {
    const delta = clamp(sumWeightedValence(input.facts), -2, 2);
    return this.store.upsertOnTurn({
      userId: input.userId,
      characterId: input.characterId,
      valenceDelta: delta,
      tier: null,
      now: input.now,
    });
  }
}

function categoryWeight(category: string): number {
  switch (category) {
    case "EMOTION":
      return 2;
    case "IDENTITY":
    case "PREFERENCE":
    case "RELATIONSHIP":
      return 1;
    default:
      return 0.5;
  }
}

function sumWeightedValence(facts: readonly MemoryFactDraft[]): number {
  if (facts.length === 0) return 0;
  let total = 0;
  for (const f of facts) {
    total += categoryWeight(f.category) * f.valence * f.confidence;
  }
  return total;
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(min, Math.min(max, v));
}
