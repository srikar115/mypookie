import "server-only";

/**
 * CreditGateway — port for credit operations.
 *
 * The implementation is currently a pass-through (always affordable, no
 * actual debit) matching the existing `TODO(billing)` pattern in the voice
 * and character modules. When `@/modules/credits` lands, only
 * `media.dependencies.ts` needs to swap in the real adapter.
 */
export interface CreditGateway {
  /** Returns the user's current balance. */
  getBalance(userId: string): Promise<number>;

  /**
   * Assert the user can afford `amount` credits.
   * Throws `InsufficientCreditsError` if not.
   */
  assertAffordable(userId: string, amount: number): Promise<void>;

  /**
   * Debit `amount` credits from the user's balance.
   * Call on generation success.
   */
  debit(userId: string, amount: number, description: string): Promise<void>;

  /**
   * Refund `amount` credits (e.g. on generation failure).
   * No-op if credits were never debited.
   */
  refund(userId: string, amount: number, description: string): Promise<void>;
}
