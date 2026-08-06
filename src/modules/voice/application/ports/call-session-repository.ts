import "server-only";
import type { CallSessionDto } from "../dto/call-session.dto";

/**
 * CallSessionRepository — port for real-time voice-call persistence.
 *
 * Call rows are created eagerly at token issuance (so the concurrent-call
 * guard has something to check) and finalized either by the client hitting
 * `/call/end` or by the LiveKit `room_finished` webhook when the client
 * disconnects abruptly.
 */
export interface CallSessionRepository {
  create(input: {
    id: string;
    conversationId: string;
    userId: string;
    characterId: string;
    livekitRoom: string;
    now: Date;
  }): Promise<CallSessionDto>;

  findById(id: string): Promise<CallSessionDto | null>;

  findByLivekitRoom(roomName: string): Promise<CallSessionDto | null>;

  /**
   * Returns the caller's currently-open call, if any. Used by the
   * concurrent-call guard in {@link StartCallUseCase}.
   */
  findActiveByUser(userId: string): Promise<CallSessionDto | null>;

  /**
   * Closes the caller's abandoned calls — rows still open whose last sign of
   * life predates `silentSince`.
   *
   * A call is only finalized by the client hanging up or by LiveKit's
   * `room_finished` webhook. Both can go missing: a killed browser sends
   * neither, and a LiveKit deployment that cannot reach this app (local dev,
   * a tunnel that expired, a misconfigured webhook URL) never delivers the
   * fallback. The row then stays open forever, and because it is open it both
   * blocks every future call and is billed as one continuous call against the
   * daily cap.
   *
   * Liveness comes from `updatedAt`: the credit ticker touches a live session
   * every 12 seconds, so silence measured in minutes means nobody is there.
   *
   * Returns the number of rows closed.
   */
  reapAbandonedByUser(input: {
    userId: string;
    silentSince: Date;
    now: Date;
  }): Promise<number>;

  /**
   * Total voice minutes spent by a user in the last 24 hours, rounded up.
   * Used to enforce the daily cap.
   */
  minutesUsedInLastDay(userId: string, now: Date): Promise<number>;

  /** Increments the persisted turn count atomically. */
  bumpTurnCount(id: string): Promise<void>;

  /** Adds `credits` to the running cost total (used by the credit ticker). */
  addCreditCost(id: string, credits: number): Promise<void>;

  /**
   * Finalizes a call row. Idempotent — calling twice with the same
   * `endedAt` is a no-op after the first commit.
   */
  finalize(input: {
    id: string;
    endedAt: Date;
    durationSec: number;
    dropReason: string | null;
    summary?: string | null;
  }): Promise<CallSessionDto>;

  /** Convenience for the summarizer pipeline. */
  setSummary(id: string, summary: string): Promise<void>;
}
