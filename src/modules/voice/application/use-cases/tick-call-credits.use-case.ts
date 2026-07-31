import "server-only";
import type { CallSessionRepository } from "../ports/call-session-repository";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
} from "../../domain/errors";

export interface CreditTickResult {
  readonly shouldEnd: boolean;
  readonly reason: string | null;
  readonly totalCostCredits: number;
}

/**
 * TickCallCredits — accounts for one billing interval of an in-flight call.
 *
 * Called by the client-side ticker in `useVoiceCall` every N seconds
 * (matches `VOICE_CREDITS_PER_MINUTE / 5` seconds so we accrue in whole
 * credits). Also called by the LiveKit agent as a heartbeat, so calls
 * whose client has crashed still bill correctly.
 *
 * Contract:
 *   - Accumulates `credits` onto `call_sessions.costCredits`.
 *   - Refuses to double-tick an already-finalized call.
 *   - Returns `shouldEnd=true` when the caller has burned through their
 *     credit balance. The caller (route handler) is expected to
 *     immediately invoke `EndCallUseCase` with reason=credit_exhausted.
 *
 * TODO(billing): user credit-balance decrement is stubbed. The Users
 * table doesn't yet have a `credits` column — once the billing module
 * lands, this use case reads + decrements it under a row lock and
 * returns `shouldEnd=true` when it hits zero.
 */
export class TickCallCreditsUseCase {
  constructor(private readonly callSessions: CallSessionRepository) {}

  async execute(input: {
    callSessionId: string;
    actorUserId: string;
    credits: number;
  }): Promise<CreditTickResult> {
    if (input.credits <= 0) {
      return { shouldEnd: false, reason: null, totalCostCredits: 0 };
    }
    const session = await this.callSessions.findById(input.callSessionId);
    if (!session) throw new CallSessionNotFoundError(input.callSessionId);
    if (session.userId !== input.actorUserId) {
      throw new CallSessionAccessDeniedError(input.callSessionId);
    }
    if (session.endedAt) {
      // Call already ended — ticker races with hang-up. Report the last
      // known total so the client can display the final receipt.
      return {
        shouldEnd: true,
        reason: "already_ended",
        totalCostCredits: session.costCredits,
      };
    }

    await this.callSessions.addCreditCost(session.id, input.credits);

    // TODO(billing): when users.credits lands, subtract `credits` here
    // and set shouldEnd=true if the balance hits zero.
    return {
      shouldEnd: false,
      reason: null,
      totalCostCredits: session.costCredits + input.credits,
    };
  }
}
