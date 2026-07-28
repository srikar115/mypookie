"use server";

import { getServerContext } from "@/composition/server-context";
import { createCreateCharacterDraftUseCase } from "../../composition/characters.dependencies";
import { wizardPayloadSchema } from "../schemas/wizard-payload.schema";

export type CreateDraftResult =
  | { ok: true; characterId: string }
  | { ok: false; error: string };

/**
 * Server Action wrapping CreateCharacterDraftUseCase. Called from the
 * wizard's CharacterStep when the user clicks NEXT.
 *
 * Returns a serializable result object (never throws for expected errors);
 * the wizard state machine drives navigation off the tag.
 */
export async function createCharacterDraftAction(
  raw: unknown,
): Promise<CreateDraftResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in to create a character." };
  }

  const parsed = wizardPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Invalid wizard payload.",
    };
  }

  const useCase = createCreateCharacterDraftUseCase(ctx);
  const result = await useCase.execute({
    ownerUserId: ctx.actor.id,
    name: parsed.data.name,
    appearance: parsed.data.appearance,
    personalitySlug: parsed.data.personalitySlug,
    relationshipSlug: parsed.data.relationshipSlug,
    occupationSlug: parsed.data.occupationSlug,
    voiceSlug: parsed.data.voiceSlug,
    hobbies: parsed.data.hobbies,
    language: parsed.data.language,
    nsfwOptIn: parsed.data.nsfwOptIn,
    backstory: parsed.data.backstory,
  });

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, characterId: result.value.characterId };
}
