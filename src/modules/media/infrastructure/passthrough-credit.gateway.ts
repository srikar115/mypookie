import "server-only";
import type { CreditGateway } from "../application/ports/credit-gateway";
import { InsufficientCreditsError } from "../domain/media-generation";

/**
 * PassthroughCreditGateway — stub implementation.
 *
 * TODO(billing): when @/modules/credits lands, swap this adapter in
 * `media.dependencies.ts` for the real implementation. This matches the
 * existing `TODO(billing)` pattern in voice/tick-call-credits.use-case.ts
 * and characters/commit-character.use-case.ts.
 *
 * Current behavior:
 *   - getBalance always returns NEW_USER_TRIAL_CREDITS (100 by default)
 *   - assertAffordable always passes (no real wallet check)
 *   - debit/refund are no-ops (accumulate cost in media_generations.costCredits)
 */
export class PassthroughCreditGateway implements CreditGateway {
  // Sentinel balance large enough that the "insufficient credits" UI path
  // is reachable for testing: pass 0 here in tests.
  private readonly balance: number;

  constructor(balance = 10_000) {
    this.balance = balance;
  }

  async getBalance(_userId: string): Promise<number> {
    return this.balance;
  }

  async assertAffordable(_userId: string, amount: number): Promise<void> {
    if (amount > this.balance) {
      throw new InsufficientCreditsError(amount, this.balance);
    }
  }

  async debit(_userId: string, _amount: number, _description: string): Promise<void> {
    // TODO(billing): deduct from users.creditBalance under a row lock.
  }

  async refund(_userId: string, _amount: number, _description: string): Promise<void> {
    // TODO(billing): credit back to users.creditBalance.
  }
}
