/**
 * Domain errors for the voice module. Plain classes so presentation-layer
 * callers can `instanceof`-check without importing infra.
 */

export class CallSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Call session ${id} not found.`);
    this.name = "CallSessionNotFoundError";
  }
}

export class CallSessionAccessDeniedError extends Error {
  constructor(id: string) {
    super(`Actor is not permitted to access call session ${id}.`);
    this.name = "CallSessionAccessDeniedError";
  }
}

/**
 * Thrown by {@link StartCallUseCase} when the user already has a call that
 * hasn't been finalized. One-concurrent-call cap is a hard safety measure
 * against runaway provider bills.
 */
export class ConcurrentCallLimitError extends Error {
  constructor(userId: string) {
    super(`User ${userId} already has an active call.`);
    this.name = "ConcurrentCallLimitError";
  }
}

/**
 * Thrown by {@link StartCallUseCase} when the user has burned through the
 * daily minutes cap. Prevents a single user from monopolising the voice bill.
 */
export class DailyCallLimitExceededError extends Error {
  constructor(minutesUsed: number, cap: number) {
    super(
      `User has used ${minutesUsed} of ${cap} allowed voice-call minutes today.`,
    );
    this.name = "DailyCallLimitExceededError";
  }
}

/**
 * Thrown when the voice-calls beta flag is off or the user isn't allow-listed.
 */
export class VoiceCallsDisabledError extends Error {
  constructor(reason: string) {
    super(`Voice calls are not available: ${reason}`);
    this.name = "VoiceCallsDisabledError";
  }
}

/**
 * Thrown when the LiveKit token issuance step fails. Wraps the SDK error
 * so route handlers can map it to a stable HTTP code without leaking
 * provider-specific detail.
 */
export class VoiceTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceTransportError";
  }
}
