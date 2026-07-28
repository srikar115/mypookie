import type { CharacterLookupsDto } from "../dto/lookups.dto";
import type { CharacterRepository } from "../ports/character-repository";

/**
 * Loads the four wizard picker lists (personalities, relationships,
 * occupations, voices). NSFW-only occupations are filtered out when the
 * caller isn't age-verified or hasn't opted in.
 */
export class GetCharacterLookupsUseCase {
  constructor(private readonly repo: CharacterRepository) {}

  async execute(input: { nsfwAllowed: boolean }): Promise<CharacterLookupsDto> {
    return this.repo.listLookups(input.nsfwAllowed);
  }
}
