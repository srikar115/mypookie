import { err, ok, type Result } from "@/shared/application/result";
import type { Clock } from "@/shared/application/clock";
import {
  CharacterAccessDeniedError,
  CharacterAlreadyCommittedError,
  CharacterNotFoundError,
} from "../../domain/errors";
import type { CharacterRepository } from "../ports/character-repository";

export interface CommitCharacterCommand {
  readonly characterId: string;
  readonly actorUserId: string;
}

export type CommitCharacterError =
  | CharacterNotFoundError
  | CharacterAccessDeniedError
  | CharacterAlreadyCommittedError;

/**
 * Promotes a DRAFT character to ACTIVE. This is the "BRING MY AI TO LIFE"
 * click (screenshot 7).
 *
 * Future work: this is where the 10-credit debit will hook in (product-
 * research §3.3). The wallet module doesn't exist yet, so we skip that step;
 * when it does, wrap the update in a transaction with a credit reservation.
 */
export class CommitCharacterUseCase {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CommitCharacterCommand,
  ): Promise<Result<{ characterId: string }, CommitCharacterError>> {
    const character = await this.repo.findById(input.characterId);
    if (!character) return err(new CharacterNotFoundError(input.characterId));
    if (character.ownerUserId !== input.actorUserId) {
      return err(new CharacterAccessDeniedError());
    }

    try {
      const committed = character.commit(this.clock.now());
      await this.repo.update(committed);
      return ok({ characterId: committed.id });
    } catch (e) {
      if (e instanceof CharacterAlreadyCommittedError) return err(e);
      throw e;
    }
  }
}
