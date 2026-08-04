import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getServerContext } from "@/composition/server-context";
import { createRunMediaGenerationUseCase } from "@/modules/media";
import { MediaGenerationNotFoundError, MediaGenerationAccessDeniedError } from "@/modules/media";

/**
 * POST /api/media/run
 *
 * Fires the actual fal.ai generation pipeline for an existing PENDING
 * media_generations row. Called by the client immediately after
 * startMediaGenerationAction succeeds.
 *
 * The route is kept alive (keepalive: true on the fetch) for the full
 * generation duration. Image timeout is ~90s; video ~5min. Raise
 * maxDuration accordingly.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 330; // 5.5 min — covers video timeout + buffer

const bodySchema = z.object({
  mediaId: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return jsonError(401, "Unauthorized.");
  }

  let payload: { mediaId: string };
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid body.");
    }
    payload = parsed.data;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const uc = createRunMediaGenerationUseCase(ctx);
  try {
    await uc.execute({ mediaId: payload.mediaId, actorUserId: ctx.actor.id });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof MediaGenerationNotFoundError) {
      return jsonError(404, "Media generation not found.");
    }
    if (e instanceof MediaGenerationAccessDeniedError) {
      return jsonError(403, "Access denied.");
    }
    console.error("[api/media/run]", e);
    return jsonError(500, "Generation failed. Please try again.");
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
