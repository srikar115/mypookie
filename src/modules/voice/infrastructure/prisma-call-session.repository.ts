import "server-only";
import type { CallSession, PrismaClient } from "@prisma/client";
import type { CallSessionRepository } from "../application/ports/call-session-repository";
import type { CallSessionDto } from "../application/dto/call-session.dto";

/**
 * Prisma adapter for {@link CallSessionRepository}. Straightforward mapping
 * layer — no business logic. The one place we do a raw aggregation is
 * `minutesUsedInLastDay` because summing durations across finalized rows
 * PLUS estimating the running clock on the in-flight row is easier in SQL
 * than in TS.
 */
export class PrismaCallSessionRepository implements CallSessionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: {
    id: string;
    conversationId: string;
    userId: string;
    characterId: string;
    livekitRoom: string;
    now: Date;
  }): Promise<CallSessionDto> {
    const row = await this.db.callSession.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        userId: input.userId,
        characterId: input.characterId,
        livekitRoom: input.livekitRoom,
        startedAt: input.now,
      },
    });
    return toDto(row);
  }

  async findById(id: string): Promise<CallSessionDto | null> {
    const row = await this.db.callSession.findUnique({ where: { id } });
    return row ? toDto(row) : null;
  }

  async findByLivekitRoom(roomName: string): Promise<CallSessionDto | null> {
    const row = await this.db.callSession.findUnique({
      where: { livekitRoom: roomName },
    });
    return row ? toDto(row) : null;
  }

  async findActiveByUser(userId: string): Promise<CallSessionDto | null> {
    const row = await this.db.callSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    return row ? toDto(row) : null;
  }

  async minutesUsedInLastDay(userId: string, now: Date): Promise<number> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // Sum finalized durations + estimate the running duration on any
    // in-flight call. Second-precision rounded up to whole minutes.
    const result = await this.db.$queryRaw<
      { total_seconds: bigint | number | null }[]
    >`
      SELECT COALESCE(SUM(
        COALESCE(
          "durationSec",
          EXTRACT(EPOCH FROM (${now} - "startedAt"))::int
        )
      ), 0)::bigint AS total_seconds
      FROM call_sessions
      WHERE "userId" = ${userId}
        AND "startedAt" >= ${since}
    `;
    const raw = result[0]?.total_seconds ?? 0;
    const totalSec = typeof raw === "bigint" ? Number(raw) : Number(raw);
    return Math.ceil(totalSec / 60);
  }

  async bumpTurnCount(id: string): Promise<void> {
    await this.db.callSession.update({
      where: { id },
      data: { turnCount: { increment: 1 } },
    });
  }

  async addCreditCost(id: string, credits: number): Promise<void> {
    if (credits === 0) return;
    await this.db.callSession.update({
      where: { id },
      data: { costCredits: { increment: credits } },
    });
  }

  async finalize(input: {
    id: string;
    endedAt: Date;
    durationSec: number;
    dropReason: string | null;
    summary?: string | null;
  }): Promise<CallSessionDto> {
    // Idempotency: `updateMany` with `endedAt IS NULL` predicate — if
    // someone else already finalized, we no-op and read back the row.
    await this.db.callSession.updateMany({
      where: { id: input.id, endedAt: null },
      data: {
        endedAt: input.endedAt,
        durationSec: input.durationSec,
        dropReason: input.dropReason,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      },
    });
    const row = await this.db.callSession.findUniqueOrThrow({
      where: { id: input.id },
    });
    return toDto(row);
  }

  async setSummary(id: string, summary: string): Promise<void> {
    await this.db.callSession.update({
      where: { id },
      data: { summary },
    });
  }
}

function toDto(row: CallSession): CallSessionDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    characterId: row.characterId,
    livekitRoom: row.livekitRoom,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSec: row.durationSec,
    turnCount: row.turnCount,
    costCredits: row.costCredits,
    dropReason: row.dropReason,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}
