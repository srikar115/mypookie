import "server-only";
import { after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
  createRecordVoiceTurnUseCase,
  ingestVoiceTurnInAfter,
} from "@/modules/voice";
import { createIngestTurnUseCase } from "@/modules/memory";
import { env } from "@/config/env";

/**
 * POST /api/webhooks/voice-agent/turn
 *
 * Server-to-server webhook: the LiveKit agent worker calls this to persist
 * a completed turn pair (user STT transcript + assistant LLM output).
 *
 * Auth model:
 *   HMAC-SHA256 signed body. Agent computes
 *     Authorization: Bearer <hex-hmac-sha256(rawBody, LIVEKIT_WEBHOOK_KEY)>
 *   and we verify with timing-safe compare. Payload body is user-controlled
 *   from the agent's viewpoint but never from the browser's — the signing
 *   secret lives only on the agent worker and this route.
 *
 * The payload includes an explicit `actorUserId` (looked up from the
 * CallSession by the agent) so we can enforce the "voice turns only land
 * on the CallSession owner's messages" invariant server-side. Any mismatch
 * → 403.
 */

const bodySchema = z.object({
  actorUserId: z.string().uuid(),
  turn: z.object({
    callSessionId: z.string().uuid(),
    conversationId: z.string().uuid(),
    userTranscript: z.string().min(1).max(4000),
    assistantContent: z.string().min(1).max(8000),
    userAudioR2Key: z.string().nullable().optional(),
    assistantAudioR2Key: z.string().nullable().optional(),
    ttsMarkupTags: z.array(z.string()).optional(),
    latencyMs: z.number().nullable().optional(),
    modelId: z.string().nullable().optional(),
  }),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const secret = env.LIVEKIT_WEBHOOK_KEY;
  if (!secret) {
    return jsonError(500, "Voice webhook signing key not configured.");
  }

  const rawBody = await request.text();
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!verifyHmac(rawBody, secret, provided)) {
    return jsonError(401, "Invalid signature.");
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(JSON.parse(rawBody));
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

  // Server context: unauthenticated session (webhook path). Auth already
  // done via HMAC above. Downstream use case cross-checks actor against
  // the CallSession owner so a compromised agent still can't scribble on
  // someone else's messages.
  const server = await getServerContext();
  const record = createRecordVoiceTurnUseCase(server);

  let result;
  try {
    result = await record.execute({
      turn: payload.turn,
      actorUserId: payload.actorUserId,
    });
  } catch (e) {
    if (e instanceof CallSessionNotFoundError) {
      return jsonError(404, "Call session not found.");
    }
    if (e instanceof CallSessionAccessDeniedError) {
      return jsonError(403, "Actor does not own this call.");
    }
    console.error("[voice.webhook.turn]", e);
    return jsonError(500, "Unexpected server error.");
  }

  // Per-turn metric. `latency_ms` is end-to-end from user's `is_final`
  // STT event to Cartesia's first audio byte (measured in the agent
  // worker and shipped over the wire) — this is the number to watch
  // for regressions.
  console.info(
    `[voice.metric] event=turn session=${payload.turn.callSessionId} user=${payload.actorUserId} latency_ms=${payload.turn.latencyMs ?? "n/a"} user_len=${payload.turn.userTranscript.length} assistant_len=${payload.turn.assistantContent.length}`,
  );

  after(async () => {
    try {
      const ingest = createIngestTurnUseCase(server);
      await ingestVoiceTurnInAfter(ingest, result.ingestPayload);
    } catch (e) {
      console.warn("[voice.webhook.turn] ingest failed", e);
    }
  });

  return Response.json({
    ok: true,
    userMessageId: result.userMessageId,
    assistantMessageId: result.assistantMessageId,
  });
}

/**
 * HMAC-SHA256 verify with timing-safe compare. Constant-time to blunt
 * signature-recovery timing attacks even though our secret is 32+ bytes.
 */
function verifyHmac(body: string, secret: string, providedHex: string): boolean {
  if (!providedHex) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
