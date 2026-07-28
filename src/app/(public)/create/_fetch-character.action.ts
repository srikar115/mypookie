"use server";

import { getServerContext } from "@/composition/server-context";
import {
  createCharacterReadRepository,
} from "@/modules/characters";
import type { CharacterDto } from "@/modules/characters";

/**
 * Read-side Server Action used by the wizard after a successful draft
 * creation. Returns the joined DTO (with lookup labels + active image) so
 * the PreviewScreen has everything it needs to render.
 */
export async function fetchCharacterAction(
  characterId: string,
): Promise<CharacterDto | null> {
  const ctx = await getServerContext();
  if (!ctx.actor) return null;
  const repo = createCharacterReadRepository(ctx);
  const dto = await repo.findDtoById(characterId);
  if (!dto) return null;
  if (dto.ownerUserId !== ctx.actor.id) return null;
  return dto;
}
