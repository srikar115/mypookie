/**
 * CallSessionDto — provider-agnostic shape read by the UI and route handlers.
 * Mirrors `call_sessions` rows but converts DateTime → ISO strings so
 * Server Actions can return it directly without hydration mismatches.
 */
export interface CallSessionDto {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly characterId: string;
  readonly livekitRoom: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSec: number | null;
  readonly turnCount: number;
  readonly costCredits: number;
  readonly dropReason: string | null;
  readonly summary: string | null;
  readonly createdAt: string;
}
