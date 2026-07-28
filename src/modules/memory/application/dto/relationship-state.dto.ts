/**
 * RelationshipTier / RelationshipStateSnapshot — application-layer view of
 * the persisted `relationship_states` row. Redefined here (rather than
 * imported from `@prisma/client`) so the application layer stays
 * framework-free (rule 4). Values match the Prisma enum literals so
 * adapters can cast through without a translation step.
 */
export type RelationshipTier =
  | "STRANGER"
  | "ACQUAINTANCE"
  | "FRIEND"
  | "CLOSE_FRIEND"
  | "ROMANTIC_INTEREST"
  | "PARTNER"
  | "SOULMATE";

export interface RelationshipStateSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly characterId: string;
  readonly trust: number;
  readonly affection: number;
  readonly respect: number;
  readonly familiarity: number;
  readonly tension: number;
  readonly affinity: number;
  readonly tier: RelationshipTier;
  readonly lastInteractionAt: Date;
  readonly totalMessages: number;
  readonly streakDays: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
