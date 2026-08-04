"use server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
// Same-module deep imports on purpose — see start-media-generation.action.ts.
import { createListRecentMediaUseCase } from "../../composition/media.dependencies";
import type { RecentMediaItem } from "../../application/dto/media-generation.dto";

const schema = z.object({
  characterId: z.string().uuid(),
  limit: z.number().int().min(1).max(24).default(9),
});

export type ListRecentMediaActionResult =
  | { ok: true; items: RecentMediaItem[] }
  | { ok: false; error: string };

/**
 * Completed images for this user + companion, for the composer's
 * "edit a previous image" grid.
 *
 * Scoped to the signed-in actor inside the repository query, so one user can
 * never surface another's generations as a reference.
 */
export async function listRecentMediaAction(
  raw: unknown,
): Promise<ListRecentMediaActionResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const uc = createListRecentMediaUseCase(ctx);
    const items = await uc.execute(
      ctx.actor.id,
      parsed.data.characterId,
      parsed.data.limit,
    );
    return { ok: true, items };
  } catch (e) {
    console.error("[listRecentMediaAction]", e);
    return { ok: false, error: "Could not load recent images." };
  }
}
