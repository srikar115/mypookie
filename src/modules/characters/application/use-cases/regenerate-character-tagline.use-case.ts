import "server-only";
import { err, ok, type Result } from "@/shared/application/result";
import type { CharacterRepository } from "../ports/character-repository";
import type { TaglineGenerator } from "../ports/tagline-generator";
import { CharacterNotFoundError } from "../../domain/errors";
import type {
  BaseStyle,
  Ethnicity,
  Gender,
} from "../../domain/entities/character";

/**
 * RegenerateCharacterTagline — one-shot backfill / retry for the
 * Candy.ai-style scenario copy attached to a character. Two use cases:
 *
 *   1. Legacy characters created before the tagline generator shipped
 *      (their `tagline` column is NULL and only the templated `bio` is
 *      populated). This use case rewrites both.
 *   2. Users who want a different vibe than what the LLM produced during
 *      creation. Cheap to re-roll — one gpt-4o-mini call.
 *
 * Ownership is enforced in the use case rather than the port: the repo's
 * `findTaglineInputById` returns the row for any owner, and we compare
 * against the actor here so the presentation layer can pattern-match on
 * `NotFound` for both "row doesn't exist" and "not your character".
 */

export class OwnershipMismatchError extends Error {
  readonly code = "OWNERSHIP_MISMATCH";
  constructor(readonly characterId: string) {
    super(`Character ${characterId} does not belong to the actor.`);
    this.name = "OwnershipMismatchError";
  }
}

export type RegenerateCharacterTaglineError =
  | CharacterNotFoundError
  | OwnershipMismatchError;

export class RegenerateCharacterTaglineUseCase {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly tagline: TaglineGenerator,
  ) {}

  async execute(input: {
    actorUserId: string;
    characterId: string;
  }): Promise<Result<{ tagline: string }, RegenerateCharacterTaglineError>> {
    const row = await this.repo.findTaglineInputById(input.characterId);
    if (!row) return err(new CharacterNotFoundError(input.characterId));
    if (row.ownerUserId !== input.actorUserId) {
      return err(new OwnershipMismatchError(input.characterId));
    }

    const out = await this.tagline.generate({
      characterName: row.name,
      ageYears: row.ageYears,
      gender: row.gender as Gender,
      baseStyle: row.baseStyle as BaseStyle,
      ethnicity: row.ethnicity as Ethnicity,
      personalityLabel: row.personalityLabel,
      relationshipLabel: row.relationshipLabel,
      occupationLabel: row.occupationLabel,
      hobbies: row.hobbies,
      backstory: row.backstory,
      nsfwOptIn: row.nsfwOptIn,
      language: row.language,
    });

    const trimmed = out.tagline.trim();
    if (trimmed.length === 0) {
      // Extremely unusual — the sanitizer in the adapter already trims —
      // but we guard here so we never overwrite a good tagline with "".
      return ok({ tagline: "" });
    }

    await this.repo.updateTagline({
      characterId: input.characterId,
      tagline: trimmed,
    });

    return ok({ tagline: trimmed });
  }
}
