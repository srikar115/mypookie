"use server";

import { revalidatePath } from "next/cache";
import { getServerContext } from "@/composition/server-context";
import { createCommitCharacterUseCase } from "../../composition/characters.dependencies";
import { commitPayloadSchema } from "../schemas/wizard-payload.schema";

export type CommitCharacterResult =
  | { ok: true; characterId: string }
  | { ok: false; error: string };

export async function commitCharacterAction(
  raw: unknown,
): Promise<CommitCharacterResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = commitPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid character reference." };
  }

  const useCase = createCommitCharacterUseCase(ctx);
  const result = await useCase.execute({
    characterId: parsed.data.characterId,
    actorUserId: ctx.actor.id,
  });

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath("/");
  revalidatePath("/create");
  return { ok: true, characterId: result.value.characterId };
}
