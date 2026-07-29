"use server";

import { revalidatePath } from "next/cache";
import { getServerContext } from "@/composition/server-context";
import { createRegenerateCharacterTaglineUseCase } from "../../composition/characters.dependencies";
import { regeneratePayloadSchema } from "../schemas/wizard-payload.schema";

/**
 * Rewrites the Candy.ai-style scenario copy for one of the actor's
 * characters. Used to backfill legacy characters (created before the
 * tagline generator shipped) and to let users re-roll a blurb they don't
 * love. One LLM call, ~1-2s at gpt-4o-mini.
 */

export type RegenerateTaglineResult =
  | { ok: true; tagline: string }
  | { ok: false; error: string };

export async function regenerateCharacterTaglineAction(
  raw: unknown,
): Promise<RegenerateTaglineResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = regeneratePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid character reference." };
  }

  const useCase = createRegenerateCharacterTaglineUseCase(ctx);
  let result;
  try {
    result = await useCase.execute({
      actorUserId: ctx.actor.id,
      characterId: parsed.data.characterId,
    });
  } catch (e) {
    // Network/provider errors bubble up here — the use case only wraps
    // domain errors in Result. Log for observability, present a friendly
    // message to the user.
    console.warn("[characters] tagline regeneration failed", e);
    return {
      ok: false,
      error: "The scenario writer is unavailable right now. Please try again in a moment.",
    };
  }

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  // Invalidate the chat + My AI surfaces so a fresh scenario shows up on
  // the next navigation without a hard refresh.
  revalidatePath("/chat");
  revalidatePath("/my-ai");

  return { ok: true, tagline: result.value.tagline };
}
