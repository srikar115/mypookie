/**
 * Public API for the characters module — server-side entry points only.
 *
 * The module's client-side pieces (wizard components, hooks) live in
 * `./client.ts`. Server Components, Server Actions, and Route Handlers
 * should import from this file. Never reach into `./domain/*`,
 * `./application/*`, or `./infrastructure/*` from outside the module —
 * rule 7 of the architecture (module boundary).
 */

export {
  createGetCharacterLookupsUseCase,
  createCreateCharacterDraftUseCase,
  createRegenerateCharacterImageUseCase,
  createCommitCharacterUseCase,
  createCharacterReadRepository,
} from "./composition/characters.dependencies";

export type { CharacterDto } from "./application/dto/character.dto";
export type { CharacterSummaryDto } from "./application/dto/character-summary.dto";
export type {
  CharacterLookupsDto,
  PersonalityOptionDto,
  RelationshipOptionDto,
  OccupationOptionDto,
  VoiceOptionDto,
} from "./application/dto/lookups.dto";

export { MAX_REGENERATIONS } from "./domain/entities/character";
