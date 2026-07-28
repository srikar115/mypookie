import { err, ok, type Result } from "@/shared/application/result";
import {
  CharacterAccessDeniedError,
  CharacterAlreadyCommittedError,
  CharacterNotFoundError,
  ImageGenerationFailedError,
  RegenerationLimitReachedError,
} from "../../domain/errors";
import type { CharacterRepository } from "../ports/character-repository";
import type { ImageGenerator } from "../ports/image-generator";

export interface RegenerateCharacterImageCommand {
  readonly characterId: string;
  readonly actorUserId: string;
}

export type RegenerateCharacterImageError =
  | CharacterNotFoundError
  | CharacterAccessDeniedError
  | CharacterAlreadyCommittedError
  | RegenerationLimitReachedError
  | ImageGenerationFailedError;

/**
 * Handles the "Regenerate (0/2)" click on the preview screen.
 *
 * Business rules (enforced by the Character entity):
 *   - Only DRAFT characters can regenerate (post-commit is locked).
 *   - Hard cap of MAX_REGENERATIONS (2) per character.
 *
 * Uses image-to-image via the reference image URL so the character's face
 * stays consistent across regens (candy.ai identity-lock pattern).
 */
export class RegenerateCharacterImageUseCase {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly images: ImageGenerator,
  ) {}

  async execute(
    input: RegenerateCharacterImageCommand,
  ): Promise<
    Result<{ imageUrl: string; regenerationsRemaining: number }, RegenerateCharacterImageError>
  > {
    const character = await this.repo.findById(input.characterId);
    if (!character) return err(new CharacterNotFoundError(input.characterId));
    if (character.ownerUserId !== input.actorUserId) {
      return err(new CharacterAccessDeniedError());
    }

    const check = character.canRegenerate();
    if (!check.ok) {
      const e = check.error;
      if (e instanceof RegenerationLimitReachedError) return err(e);
      if (e instanceof CharacterAlreadyCommittedError) return err(e);
      throw e;
    }

    const existing = await this.repo.findActiveAppearance(character.id);

    let generated;
    try {
      generated = await this.images.generate({
        characterId: character.id,
        appearancePrompt: character.prompts.appearancePrompt,
        baseStyle: character.appearance.baseStyle,
        referenceImageUrl: existing?.imageUrl ?? undefined,
      });
    } catch (e) {
      return err(
        e instanceof ImageGenerationFailedError
          ? e
          : new ImageGenerationFailedError(
              e instanceof Error ? e.message : String(e),
            ),
      );
    }

    const snapshot = await this.repo.appendAppearanceProfile({
      characterId: character.id,
      appearancePrompt: character.prompts.appearancePrompt,
      imageR2Key: generated.imageR2Key,
      imageUrl: generated.imageUrl,
      faceKeypoints: generated.faceKeypoints,
    });

    const bumped = character.registerRegeneration();
    await this.repo.update(bumped);

    return ok({
      imageUrl: snapshot.imageUrl ?? generated.imageUrl,
      regenerationsRemaining: 2 - bumped.regenerationCount,
    });
  }
}
