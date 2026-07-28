"use server";

import { getServerContext } from "@/composition/server-context";
import { createRegenerateCharacterImageUseCase } from "../../composition/characters.dependencies";
import { regeneratePayloadSchema } from "../schemas/wizard-payload.schema";

export type RegenerateImageResult =
  | { ok: true; imageUrl: string; regenerationsRemaining: number }
  | { ok: false; error: string };

export async function regenerateCharacterImageAction(
  raw: unknown,
): Promise<RegenerateImageResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = regeneratePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid character reference." };
  }

  const useCase = createRegenerateCharacterImageUseCase(ctx);
  const result = await useCase.execute({
    characterId: parsed.data.characterId,
    actorUserId: ctx.actor.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return {
    ok: true,
    imageUrl: result.value.imageUrl,
    regenerationsRemaining: result.value.regenerationsRemaining,
  };
}
