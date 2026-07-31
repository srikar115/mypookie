import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
  createEndCallUseCase,
  createTickCallCreditsUseCase,
} from "@/modules/voice";
import { env } from "@/config/env";

/**
 * POST /api/chat/[conversationId]/call/tick
 *
 * Client-driven credit ticker. `useVoiceCall` hits this every 12s during
 * an active call. Server:
 *
 *   1. Accumulates `VOICE_CREDITS_PER_MINUTE / 5` credits on the row.
 *   2. Checks whether the user has burned through their balance.
 *   3. If yes, immediately fires `EndCallUseCase(dropReason=credit_exhausted)`
 *      and returns `{ ended: true }` so the client tears down.
 *
 * Response: { ok: true, ended: boolean, totalCostCredits: number }
 *
 * The ticker interval is intentionally aggressive (12s vs the naive
 * 60s-per-minute) so a runaway session terminates ~within one tick of
 * the balance hitting zero, not up to a minute later. Latency vs cost
 * accuracy trade-off; 12s is Candy's published cadence.
 */

const bodySchema = z.object({
  callSessionId: z.string().uuid(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  _ctx: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const server = await getServerContext();
  if (!server.actor) return jsonError(401, "You must be signed in.");

  let payload: { callSessionId: string };
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      );
    }
    payload = parsed.data;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  // We accumulate credits at the rate `VOICE_CREDITS_PER_MINUTE / 5`
  // per 12-second tick so a full minute lands on the target rate.
  const creditsPerTick = Math.max(
    1,
    Math.round(env.VOICE_CREDITS_PER_MINUTE / 5),
  );

  const tick = createTickCallCreditsUseCase(server);
  try {
    const result = await tick.execute({
      callSessionId: payload.callSessionId,
      actorUserId: server.actor.id,
      credits: creditsPerTick,
    });

    if (result.shouldEnd) {
      try {
        const end = createEndCallUseCase(server);
        await end.execute({
          callSessionId: payload.callSessionId,
          actorUserId: server.actor.id,
          dropReason: result.reason ?? "credit_exhausted",
        });
      } catch (e) {
        console.warn("[voice.call.tick] end after credit exhaustion failed", e);
      }
      return Response.json({
        ok: true,
        ended: true,
        totalCostCredits: result.totalCostCredits,
        reason: result.reason,
      });
    }

    return Response.json({
      ok: true,
      ended: false,
      totalCostCredits: result.totalCostCredits,
    });
  } catch (e) {
    if (e instanceof CallSessionNotFoundError) {
      return jsonError(404, "Call session not found.");
    }
    if (e instanceof CallSessionAccessDeniedError) {
      return jsonError(403, "You do not own this call.");
    }
    console.error("[voice.call.tick]", e);
    return jsonError(500, "Unexpected server error.");
  }
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
