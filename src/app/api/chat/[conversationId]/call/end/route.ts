import "server-only";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
  createEndCallUseCase,
  createSummarizeCallUseCase,
} from "@/modules/voice";

/**
 * POST /api/chat/[conversationId]/call/end
 *
 * Idempotent finalizer. Client fires this when the user taps hang-up.
 * The LiveKit `room_finished` webhook is a redundant path — if the
 * client crashes or drops WiFi, the webhook finalizes the same session
 * with reason "user_disconnect".
 *
 * Body: { callSessionId: uuid, dropReason?: string }
 *
 * `after()` schedules the 2-sentence LLM recap so the response stays
 * sub-second even though the summarizer takes 1-2s.
 */

const bodySchema = z.object({
  callSessionId: z.string().uuid("callSessionId must be a UUID."),
  dropReason: z.string().max(64).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  _ctx: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const server = await getServerContext();
  if (!server.actor) return jsonError(401, "You must be signed in.");

  let payload: { callSessionId: string; dropReason?: string };
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

  const endCall = createEndCallUseCase(server);
  try {
    const result = await endCall.execute({
      callSessionId: payload.callSessionId,
      actorUserId: server.actor.id,
      dropReason: payload.dropReason ?? "user_hangup",
    });

    // One log line per finalized call — feeds the "drop reasons"
    // distribution + average duration dashboards. Grep-friendly shape
    // so we can pipe through jq/awk before we've adopted a metrics agent.
    if (!result.alreadyEnded) {
      console.info(
        `[voice.metric] event=call_end user=${server.actor.id} session=${result.session.id} duration_sec=${result.session.durationSec ?? 0} turns=${result.session.turnCount} credits=${result.session.costCredits} drop_reason=${result.session.dropReason ?? "unknown"}`,
      );
      after(async () => {
        try {
          const summarize = createSummarizeCallUseCase(server);
          await summarize.execute({ callSessionId: payload.callSessionId });
        } catch (e) {
          console.warn("[voice.call.end] summarize failed", e);
        }
      });
    }

    return Response.json({
      ok: true,
      session: result.session,
      alreadyEnded: result.alreadyEnded,
    });
  } catch (e) {
    if (e instanceof CallSessionNotFoundError) {
      return jsonError(404, "Call session not found.");
    }
    if (e instanceof CallSessionAccessDeniedError) {
      return jsonError(403, "You do not own this call.");
    }
    console.error("[voice.call.end]", e);
    return jsonError(500, "Unexpected server error.");
  }
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
