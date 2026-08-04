import "server-only";
import type { NextRequest } from "next/server";
import { getServerContext } from "@/composition/server-context";
import { createGetMediaStatusUseCase } from "@/modules/media";
import { MediaGenerationNotFoundError, MediaGenerationAccessDeniedError } from "@/modules/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/media/[mediaId]
 *
 * Returns the current status of a media generation for client polling.
 * The client polls every 3s until status is COMPLETED or FAILED.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ mediaId: string }> },
): Promise<Response> {
  const { mediaId } = await ctx.params;
  const server = await getServerContext();
  if (!server.actor) {
    return jsonError(401, "Unauthorized.");
  }

  const uc = createGetMediaStatusUseCase(server);
  try {
    const status = await uc.execute(mediaId, server.actor.id);
    return json({ ok: true, status });
  } catch (e) {
    if (e instanceof MediaGenerationNotFoundError) {
      return jsonError(404, "Not found.");
    }
    if (e instanceof MediaGenerationAccessDeniedError) {
      return jsonError(403, "Access denied.");
    }
    console.error("[api/media/[mediaId]]", e);
    return jsonError(500, "Unexpected error.");
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
