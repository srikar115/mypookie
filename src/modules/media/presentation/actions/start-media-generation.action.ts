"use server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import { VIDEO_RESOLUTION_OPTIONS } from "@/config/media";
// Same-module deep imports on purpose: importing this module's own barrel
// ("@/modules/media") would create a cycle that defeats Next.js's server-action
// stubbing and drags the server-only composition graph into the client bundle.
import { createStartMediaGenerationUseCase } from "../../composition/media.dependencies";
import { InsufficientCreditsError } from "../../domain/media-generation";
import type { StartMediaResult } from "../../application/dto/media-generation.dto";

const schema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["IMAGE", "VIDEO"]),
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.string().default("1:1"),
  style: z.string().nullable().default(null),
  editMode: z.boolean().default(false),
  referenceMediaId: z.string().uuid().nullable().default(null),
  userPromptText: z.string().max(2000).nullable().default(null),
  promptIsFinal: z.boolean().default(false),
  // A family id, validated against the catalog at run time — never a raw
  // provider slug, so the picker can't be used to call arbitrary endpoints.
  modelFamilyId: z.string().max(64).nullable().default(null),
  resolution: z.enum(VIDEO_RESOLUTION_OPTIONS).nullable().default(null),
  duration: z.number().int().positive().max(60).nullable().default(null),
});

export type StartMediaActionResult =
  | { ok: true; data: StartMediaResult }
  | { ok: false; error: string; code: "insufficient_credits" | "unauthorized" | "validation" | "unknown" };

export async function startMediaGenerationAction(
  raw: unknown,
): Promise<StartMediaActionResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in.", code: "unauthorized" };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      code: "validation",
    };
  }

  const uc = createStartMediaGenerationUseCase(ctx);
  try {
    const result = await uc.execute({
      actorUserId: ctx.actor.id,
      ...parsed.data,
    });
    return { ok: true, data: result };
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return {
        ok: false,
        error: `You need ${e.required} credits but only have ${e.available}.`,
        code: "insufficient_credits",
      };
    }
    console.error("[startMediaGenerationAction]", e);
    return {
      ok: false,
      error: "Could not start generation. Please try again.",
      code: "unknown",
    };
  }
}
