"use server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
// Same-module deep imports on purpose — see start-media-generation.action.ts.
import { createPreviewMediaPromptUseCase } from "../../composition/media.dependencies";
import type { PreviewMediaPromptResult } from "../../application/dto/media-generation.dto";

const schema = z.object({
  conversationId: z.string().uuid(),
  scene: z.string().min(1).max(2000),
  kind: z.enum(["IMAGE", "VIDEO"]),
  referenceMediaId: z.string().uuid().nullable().default(null),
});

export type PreviewMediaPromptActionResult =
  | { ok: true; data: PreviewMediaPromptResult }
  | { ok: false; error: string };

/**
 * Resolves the exact prompt a request would be sent with, for display in the
 * composer. Read-only — creates nothing and spends nothing.
 */
export async function previewMediaPromptAction(
  raw: unknown,
): Promise<PreviewMediaPromptActionResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) return { ok: false, error: "You must be signed in." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const uc = createPreviewMediaPromptUseCase(ctx);
    const data = await uc.execute({ actorUserId: ctx.actor.id, ...parsed.data });
    return { ok: true, data };
  } catch (e) {
    console.error("[previewMediaPromptAction]", e);
    return { ok: false, error: "Could not build the prompt preview." };
  }
}
