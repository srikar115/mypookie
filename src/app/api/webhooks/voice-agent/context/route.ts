import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "@/modules/chat";
import {
  CallSessionAccessDeniedError,
  CallSessionNotFoundError,
  createBuildVoiceContextUseCase,
} from "@/modules/voice";
import { createAssembleContextUseCase } from "@/modules/memory";
import { env } from "@/config/env";

/**
 * POST /api/webhooks/voice-agent/context
 *
 * Server-to-server endpoint the LiveKit agent hits on every user
 * utterance (and once at call-open with an empty `latestUserMessage` to
 * fetch the opener context).
 *
 * Response is the pre-composed `messages[]` the agent feeds to
 * OpenRouter. Also returns the resolved LLM model so the agent uses the
 * DB-configured provider + params rather than hard-coding.
 *
 * Same HMAC signing scheme as `/turn` — see that route for rationale.
 */

const bodySchema = z.object({
  actorUserId: z.string().uuid(),
  callSessionId: z.string().uuid(),
  latestUserMessage: z.string().max(4000),
  actorDisplayName: z.string().nullable().optional(),
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

  const server = await getServerContext();
  const memory = createAssembleContextUseCase(server);
  const build = createBuildVoiceContextUseCase(server, memory);

  let built;
  try {
    built = await build.execute({
      callSessionId: payload.callSessionId,
      actorUserId: payload.actorUserId,
      actorDisplayName: payload.actorDisplayName ?? null,
      latestUserMessage: payload.latestUserMessage,
    });
  } catch (e) {
    if (
      e instanceof CallSessionNotFoundError ||
      e instanceof ConversationNotFoundError
    ) {
      return jsonError(404, "Call session or conversation not found.");
    }
    if (
      e instanceof CallSessionAccessDeniedError ||
      e instanceof ConversationAccessDeniedError
    ) {
      return jsonError(403, "Actor does not own this call.");
    }
    if (e instanceof ChatCharacterUnavailableError) {
      return jsonError(410, "Companion no longer available.");
    }
    console.error("[voice.webhook.context]", e);
    return jsonError(500, "Unexpected server error.");
  }

  let model;
  try {
    model = await server.models.resolve("VOICE_LLM");
  } catch (e) {
    console.error("[voice.webhook.context] VOICE_LLM not configured", e);
    return jsonError(500, "Voice LLM not configured.");
  }

  return Response.json({
    ok: true,
    model: {
      modelId: model.modelId,
      endpoint: model.endpoint,
      parameters: model.parameters,
    },
    character: {
      id: built.character.id,
      name: built.character.name,
      gender: built.character.gender,
    },
    voice: {
      providerVoiceId: built.voice.providerVoiceId,
      source: built.voice.source,
    },
    messages: built.messages,
    historyTurnCount: built.historyTurnCount,
    callSessionId: built.callSessionId,
  });
}

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
