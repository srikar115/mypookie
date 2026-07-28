import "server-only";
import type { PrismaClient, RelationshipState } from "@prisma/client";
import type { RelationshipStore } from "../application/ports/relationship-store";
import type {
  RelationshipStateSnapshot,
  RelationshipTier,
} from "../application/dto/relationship-state.dto";

/**
 * Prisma adapter for the (user, character) affinity row. `upsertOnTurn`
 * runs inside a single interactive transaction so streakDays and
 * totalMessages stay coherent under concurrent turns.
 */
export class PrismaRelationshipStore implements RelationshipStore {
  constructor(private readonly db: PrismaClient) {}

  async read(input: {
    userId: string;
    characterId: string;
  }): Promise<RelationshipStateSnapshot | null> {
    const row = await this.db.relationshipState.findUnique({
      where: {
        userId_characterId: {
          userId: input.userId,
          characterId: input.characterId,
        },
      },
    });
    return row ? toSnapshot(row) : null;
  }

  async upsertOnTurn(input: {
    userId: string;
    characterId: string;
    valenceDelta: number;
    tier: RelationshipTier | null;
    now: Date;
  }): Promise<RelationshipStateSnapshot> {
    const row = await this.db.$transaction(async (tx) => {
      const existing = await tx.relationshipState.findUnique({
        where: {
          userId_characterId: {
            userId: input.userId,
            characterId: input.characterId,
          },
        },
      });

      const streakDays = computeStreak(
        existing?.lastInteractionAt ?? null,
        input.now,
        existing?.streakDays ?? 0,
      );

      const newAffinity = clamp(
        (existing?.affinity ?? 0) + input.valenceDelta,
        -100,
        100,
      );

      const totalMessages = (existing?.totalMessages ?? 0) + 1;

      // Small tier nudges from affinity too: keep the override the caller
      // passed in if present, otherwise derive from counters.
      const tier = input.tier ?? deriveTier(totalMessages, newAffinity);

      if (!existing) {
        return tx.relationshipState.create({
          data: {
            userId: input.userId,
            characterId: input.characterId,
            trust: 50,
            affection: 50,
            respect: 50,
            familiarity: 0,
            tension: 0,
            affinity: newAffinity,
            tier,
            lastInteractionAt: input.now,
            totalMessages,
            streakDays,
          },
        });
      }

      return tx.relationshipState.update({
        where: { id: existing.id },
        data: {
          affinity: newAffinity,
          familiarity: clamp(existing.familiarity + 1, 0, 100),
          tier,
          lastInteractionAt: input.now,
          totalMessages,
          streakDays,
        },
      });
    });

    return toSnapshot(row);
  }
}

function toSnapshot(row: RelationshipState): RelationshipStateSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    characterId: row.characterId,
    trust: row.trust,
    affection: row.affection,
    respect: row.respect,
    familiarity: row.familiarity,
    tension: row.tension,
    affinity: row.affinity,
    tier: row.tier as RelationshipTier,
    lastInteractionAt: row.lastInteractionAt,
    totalMessages: row.totalMessages,
    streakDays: row.streakDays,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Streak rules (v1):
 *   - First interaction ever → 1.
 *   - Same UTC day as last interaction → keep current streak.
 *   - Next UTC day → +1.
 *   - Gap of 2+ days → reset to 1.
 */
function computeStreak(
  lastAt: Date | null,
  now: Date,
  currentStreak: number,
): number {
  if (!lastAt) return 1;
  const lastDay = Math.floor(lastAt.getTime() / 86_400_000);
  const nowDay = Math.floor(now.getTime() / 86_400_000);
  const diff = nowDay - lastDay;
  if (diff <= 0) return Math.max(currentStreak, 1);
  if (diff === 1) return currentStreak + 1;
  return 1;
}

/**
 * Tier ladder (v1). Real product will tune from data.
 */
function deriveTier(totalMessages: number, affinity: number): RelationshipTier {
  if (totalMessages >= 500 && affinity >= 60) return "SOULMATE";
  if (totalMessages >= 200 && affinity >= 40) return "PARTNER";
  if (totalMessages >= 80 && affinity >= 20) return "ROMANTIC_INTEREST";
  if (totalMessages >= 40) return "CLOSE_FRIEND";
  if (totalMessages >= 15) return "FRIEND";
  if (totalMessages >= 5) return "ACQUAINTANCE";
  return "STRANGER";
}
