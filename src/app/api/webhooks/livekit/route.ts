import "server-only";
import { after, type NextRequest } from "next/server";
import { getServerContext } from "@/composition/server-context";
import {
  VoiceTransportError,
  createCallSessionRepository,
  createEndCallUseCase,
  createSummarizeCallUseCase,
  createVoiceTransport,
} from "@/modules/voice";

/**
 * POST /api/webhooks/livekit
 *
 * Fallback path for calls the client never explicitly ends (tab close,
 * crashed browser, phone dropped, network flap that exceeds LiveKit's
 * reconnect window). LiveKit emits `room_finished` after their internal
 * grace period; we translate that to `EndCallUseCase(dropReason=…)`.
 *
 * Signature verification uses LiveKit's `WebhookReceiver.receive(body,
 * authHeader)`. The receiver checks HS256 against `LIVEKIT_API_SECRET`
 * so we cannot forge callbacks from the public internet.
 *
 * We handle only two events:
 *   - room_finished: normal end-of-call — finalize + summarize
 *   - participant_disconnected: user's browser tab closed — same path
 *
 * All other events (participant_joined, track_published, etc.) are
 * ignored; if we ever add analytics we can dispatch on `event` here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LivekitWebhookEvent {
  event: string;
  room?: { name?: string };
  participant?: { identity?: string };
}

export async function POST(request: NextRequest): Promise<Response> {
  // Server context here is unauthenticated — webhooks come from LiveKit,
  // not the user. Actor stays null; we authorize via signature verification.
  const server = await getServerContext();
  const transport = createVoiceTransport(server);

  const rawBody = await request.text();
  const authHeader = request.headers.get("authorization");

  let event: LivekitWebhookEvent;
  try {
    event = (await transport.verifyWebhook({
      rawBody,
      authorizationHeader: authHeader,
    })) as LivekitWebhookEvent;
  } catch (e) {
    if (e instanceof VoiceTransportError) {
      console.warn("[voice.webhook.livekit] rejected", e.message);
      return new Response("Unauthorized", { status: 401 });
    }
    console.error("[voice.webhook.livekit] verifier crashed", e);
    return new Response("Bad Request", { status: 400 });
  }

  const roomName = event.room?.name;
  if (!roomName) return new Response("ok", { status: 200 });

  if (event.event !== "room_finished" && event.event !== "participant_disconnected") {
    return new Response("ok", { status: 200 });
  }

  const callSessions = createCallSessionRepository(server);
  const session = await callSessions.findByLivekitRoom(roomName);
  if (!session) {
    console.warn(
      `[voice.webhook.livekit] no CallSession for room=${roomName} (event=${event.event}) — likely already GC'd`,
    );
    return new Response("ok", { status: 200 });
  }

  const dropReason =
    event.event === "room_finished" ? "provider_room_finished" : "user_disconnect";

  const endCall = createEndCallUseCase(server);
  try {
    const result = await endCall.execute({
      callSessionId: session.id,
      actorUserId: null,
      dropReason,
    });
    if (!result.alreadyEnded) {
      after(async () => {
        try {
          const summarize = createSummarizeCallUseCase(server);
          await summarize.execute({ callSessionId: session.id });
        } catch (e) {
          console.warn("[voice.webhook.livekit] summarize failed", e);
        }
      });
    }
  } catch (e) {
    console.error("[voice.webhook.livekit] endCall failed", e);
  }

  return new Response("ok", { status: 200 });
}
