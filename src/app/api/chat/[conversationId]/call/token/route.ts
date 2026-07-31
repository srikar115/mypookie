import "server-only";
import type { NextRequest } from "next/server";
import { getServerContext } from "@/composition/server-context";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "@/modules/chat";
import {
  ConcurrentCallLimitError,
  DailyCallLimitExceededError,
  VoiceCallsDisabledError,
  VoiceTransportError,
  createStartCallUseCase,
} from "@/modules/voice";
import { env } from "@/config/env";

/**
 * POST /api/chat/[conversationId]/call/token
 *
 * Mints a LiveKit access token AND writes the CallSession row that anchors
 * the whole call. See {@link StartCallUseCase} for the flow.
 *
 * Client contract:
 *   200: { session, grant } — client connects to `grant.url` with `grant.token`
 *   401: unauthenticated
 *   403: conversation access denied
 *   404: conversation not found
 *   409: concurrent call limit OR daily minutes cap exceeded
 *   410: character unavailable (archived / not owned)
 *   422: voice feature disabled for this user
 *   502: LiveKit token issuance failed (provider outage)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await ctx.params;

  const server = await getServerContext();
  if (!server.actor) {
    return jsonError(401, "You must be signed in to start a call.");
  }

  // Global kill-switch. When on, the feature is available to every
  // authenticated user (subject to per-user daily/concurrent limits
  // enforced inside StartCallUseCase). The `users.voiceCallsBeta` column
  // remains in the schema so we can re-introduce an allow-list later
  // without a migration.
  if (!env.VOICE_CALLS_ENABLED) {
    return jsonError(422, "Voice calls are not enabled on this deployment.");
  }

  const startCall = createStartCallUseCase(server);
  const t0 = Date.now();
  try {
    const result = await startCall.execute({
      actorUserId: server.actor.id,
      actorDisplayName: server.actor.displayName,
      conversationId,
    });
    console.info(
      `[voice.metric] event=call_start user=${server.actor.id} session=${result.session.id} conv=${conversationId} setup_ms=${Date.now() - t0}`,
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ConversationNotFoundError) {
      return jsonError(404, "Conversation not found.");
    }
    if (e instanceof ConversationAccessDeniedError) {
      return jsonError(403, "You do not own this conversation.");
    }
    if (e instanceof ChatCharacterUnavailableError) {
      return jsonError(410, "This companion is not available.");
    }
    if (e instanceof ConcurrentCallLimitError) {
      return jsonError(
        409,
        "You already have an active call. End it before starting a new one.",
      );
    }
    if (e instanceof DailyCallLimitExceededError) {
      return jsonError(
        409,
        "You've hit today's voice-call limit. Come back tomorrow.",
      );
    }
    if (e instanceof VoiceCallsDisabledError) {
      return jsonError(422, e.message);
    }
    if (e instanceof VoiceTransportError) {
      console.error("[voice.call.token] transport error", e);
      return jsonError(502, "Voice provider unavailable. Please try again.");
    }
    console.error("[voice.call.token]", e);
    return jsonError(500, "Unexpected server error.");
  }
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
