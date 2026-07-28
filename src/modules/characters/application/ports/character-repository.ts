import type { Character } from "../../domain/entities/character";
import type { CharacterLookupsDto } from "../dto/lookups.dto";
import type { CharacterDto } from "../dto/character.dto";
import type { CharacterSummaryDto } from "../dto/character-summary.dto";

/**
 * CharacterRepository — the port the characters module uses to persist and
 * fetch characters. Concrete implementation lives in `infrastructure/`.
 *
 * Read model methods (findDtoById, listLookups, findActiveAppearance) return
 * DTO shapes rather than entities — they exist to serve the presentation
 * layer directly and don't need domain behavior.
 */
export interface AppearanceProfileSnapshot {
  readonly id: string;
  readonly version: number;
  readonly appearancePrompt: string;
  readonly referenceImageR2Key: string | null;
  readonly imageUrl: string | null;
}

export interface CharacterRepository {
  /** Persist a fresh DRAFT character (no appearance profile yet). */
  createDraft(character: Character): Promise<void>;

  /** Update mutable state (status, regenerationCount, committedAt). */
  update(character: Character): Promise<void>;

  /** Fetch a full domain entity (throws CharacterNotFoundError). */
  findById(id: string): Promise<Character | null>;

  /** Fetch a serialized DTO with joined lookup labels + active image. */
  findDtoById(id: string): Promise<CharacterDto | null>;

  /** Return the currently active appearance profile snapshot for this char. */
  findActiveAppearance(characterId: string): Promise<AppearanceProfileSnapshot | null>;

  /**
   * Attach a new appearance profile. Deactivates the previous active row
   * (isActive=false) and inserts the new one with version=prev.version+1.
   * Returns the newly-created snapshot.
   */
  appendAppearanceProfile(input: {
    characterId: string;
    appearancePrompt: string;
    imageR2Key: string;
    imageUrl: string;
    faceKeypoints: unknown | null;
  }): Promise<AppearanceProfileSnapshot>;

  /** Read wizard lookup data (personalities, relationships, occupations, voices). */
  listLookups(nsfwAllowed: boolean): Promise<CharacterLookupsDto>;

  /**
   * List a user's characters for gallery / chat sidebar views. Ordered by
   * most-recently created first so freshly minted companions surface at
   * the top. Excludes ARCHIVED but includes DRAFT so users see everything
   * they've started, not only committed characters.
   */
  listByOwner(ownerUserId: string): Promise<CharacterSummaryDto[]>;
}
