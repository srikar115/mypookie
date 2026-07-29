import { err, ok, type Result } from "@/shared/application/result";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import {
  Character,
  type BaseStyle,
  type BodyType,
  type Ethnicity,
  type EyeColor,
  type FashionStyle,
  type Gender,
  type HairColor,
  type HairStyle,
  type SizeTier,
} from "../../domain/entities/character";
import { CharacterName } from "../../domain/value-objects/character-name";
import { AgeYears } from "../../domain/value-objects/age-years";
import { Hobbies } from "../../domain/value-objects/hobbies";
import {
  ImageGenerationFailedError,
  InvalidAgeYearsError,
  InvalidCharacterNameError,
  InvalidHobbiesError,
  LookupNotFoundError,
} from "../../domain/errors";
import type { CharacterRepository } from "../ports/character-repository";
import type { PromptCompiler } from "../ports/prompt-compiler";
import type { ImageGenerator } from "../ports/image-generator";
import type { TaglineGenerator } from "../ports/tagline-generator";

export interface CreateCharacterDraftCommand {
  readonly ownerUserId: string;
  readonly name: string;
  readonly appearance: {
    readonly baseStyle: BaseStyle;
    readonly ethnicity: Ethnicity;
    readonly gender: Gender;
    readonly ageYears: number;
    readonly eyeColor: EyeColor;
    readonly hairStyle: HairStyle;
    readonly hairColor: HairColor;
    readonly bodyType: BodyType;
    readonly bustSize: SizeTier | null;
    readonly hipSize: SizeTier | null;
    readonly clothing: string | null;
    readonly fashionStyle: FashionStyle | null;
  };
  readonly personalitySlug: string;
  readonly relationshipSlug: string;
  readonly occupationSlug: string;
  readonly voiceSlug: string;
  readonly hobbies: readonly string[];
  readonly language: string;
  readonly nsfwOptIn: boolean;
  readonly backstory: string | null;
}

export type CreateCharacterDraftError =
  | InvalidCharacterNameError
  | InvalidAgeYearsError
  | InvalidHobbiesError
  | LookupNotFoundError
  | ImageGenerationFailedError;

/**
 * Orchestrates the "NEXT" click after the wizard's Character screen:
 *   1. Validate wizard payload via domain value objects.
 *   2. Resolve slug → id for the four lookup tables (fail fast if any slug
 *      is unknown so we never persist an orphan FK).
 *   3. Compile system + appearance + bio prompts (deterministic).
 *   4. Persist the DRAFT character row.
 *   5. Generate the initial image via ImageGenerator (fal Z-Image Turbo).
 *   6. Persist the resulting appearance profile (version 1, active).
 *
 * On success returns the character id. The presentation layer navigates
 * the wizard state machine to the Preview screen and re-reads the DTO.
 */
export class CreateCharacterDraftUseCase {
  constructor(
    private readonly repo: CharacterRepository,
    private readonly prompts: PromptCompiler,
    private readonly images: ImageGenerator,
    /**
     * Nullable in tests / degraded environments. When absent, or when the
     * generator throws, we fall back to the templated bio so character
     * creation never blocks on a wobbly upstream LLM.
     */
    private readonly tagline: TaglineGenerator | null,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly lookups: LookupResolver,
  ) {}

  async execute(
    input: CreateCharacterDraftCommand,
  ): Promise<Result<{ characterId: string }, CreateCharacterDraftError>> {
    let name: CharacterName;
    let age: AgeYears;
    let hobbies: Hobbies;
    try {
      name = CharacterName.create(input.name);
      age = AgeYears.create(input.appearance.ageYears);
      hobbies = Hobbies.create(input.hobbies);
    } catch (e) {
      if (e instanceof InvalidCharacterNameError) return err(e);
      if (e instanceof InvalidAgeYearsError) return err(e);
      if (e instanceof InvalidHobbiesError) return err(e);
      throw e;
    }

    const resolved = await this.lookups.resolve({
      personalitySlug: input.personalitySlug,
      relationshipSlug: input.relationshipSlug,
      occupationSlug: input.occupationSlug,
      voiceSlug: input.voiceSlug,
    });
    if (!resolved.ok) return err(resolved.error);

    const now = this.clock.now();
    const compiled = this.prompts.compile({
      name: name.value,
      appearance: {
        baseStyle: input.appearance.baseStyle,
        ethnicity: input.appearance.ethnicity,
        gender: input.appearance.gender,
        ageYears: age.value,
        eyeColor: input.appearance.eyeColor,
        hairStyle: input.appearance.hairStyle,
        hairColor: input.appearance.hairColor,
        bodyType: input.appearance.bodyType,
        bustSize: input.appearance.bustSize,
        hipSize: input.appearance.hipSize,
        clothing: input.appearance.clothing,
        fashionStyle: input.appearance.fashionStyle,
      },
      personality: {
        personalityFragment: resolved.value.personality.promptFragment,
        relationshipFragment: resolved.value.relationship.promptFragment,
        occupationFragment: resolved.value.occupation.promptFragment,
        personalityLabel: resolved.value.personality.displayName,
        relationshipLabel: resolved.value.relationship.displayName,
        occupationLabel: resolved.value.occupation.displayName,
      },
      hobbies: hobbies.toArray(),
      language: input.language,
      nsfwOptIn: input.nsfwOptIn,
      backstory: input.backstory,
      now,
    });

    // Generate the Candy.ai-style scenario blurb. Non-blocking failure
    // path: if the LLM is unreachable / rate-limited / malformed, we fall
    // back to the deterministic templated bio so character creation never
    // stalls behind a wobbly upstream. Kicked off in parallel with nothing
    // for now, but placed here (not after createDraft) so the row we
    // persist already has the final tagline — the sidebar renders as soon
    // as the wizard advances.
    let scenarioCopy: string | null = null;
    if (this.tagline) {
      try {
        const out = await this.tagline.generate({
          characterName: name.value,
          ageYears: age.value,
          gender: input.appearance.gender,
          baseStyle: input.appearance.baseStyle,
          ethnicity: input.appearance.ethnicity,
          personalityLabel: resolved.value.personality.displayName,
          relationshipLabel: resolved.value.relationship.displayName,
          occupationLabel: resolved.value.occupation.displayName,
          hobbies: hobbies.toArray(),
          backstory: input.backstory,
          nsfwOptIn: input.nsfwOptIn,
          language: input.language,
        });
        const trimmed = out.tagline.trim();
        if (trimmed.length > 0) scenarioCopy = trimmed;
      } catch (e) {
        console.warn(
          "[characters] tagline generation failed, falling back to templated bio",
          e,
        );
      }
    }

    // Fallback chain: LLM output > compiled templated bio > null. The
    // `bio` field on `compiled` mirrors `tagline` for downstream storage
    // so the chat sidebar and My AI gallery card always show the same
    // scenario copy.
    const finalCopy = scenarioCopy ?? compiled.bio ?? null;
    const compiledWithScenario = { ...compiled, bio: finalCopy };

    const character = Character.createDraft({
      id: this.ids.next(),
      ownerUserId: input.ownerUserId,
      name,
      appearance: {
        baseStyle: input.appearance.baseStyle,
        ethnicity: input.appearance.ethnicity,
        gender: input.appearance.gender,
        age,
        eyeColor: input.appearance.eyeColor,
        hairStyle: input.appearance.hairStyle,
        hairColor: input.appearance.hairColor,
        bodyType: input.appearance.bodyType,
        bustSize: input.appearance.bustSize,
        hipSize: input.appearance.hipSize,
        clothing: input.appearance.clothing,
        fashionStyle: input.appearance.fashionStyle,
      },
      personality: {
        personalityArchetypeId: resolved.value.personality.id,
        relationshipArchetypeId: resolved.value.relationship.id,
        occupationId: resolved.value.occupation.id,
        voicePresetId: resolved.value.voice.id,
        flirtation: 50,
        patience: 50,
        moodVolatility: 50,
        dominance: 50,
      },
      hobbies,
      language: input.language,
      tags: [],
      nsfwOptIn: input.nsfwOptIn,
      tagline: finalCopy,
      backstory: input.backstory,
      prompts: compiledWithScenario,
    });

    await this.repo.createDraft(character);

    let generated;
    try {
      generated = await this.images.generate({
        characterId: character.id,
        appearancePrompt: compiled.appearancePrompt,
        baseStyle: input.appearance.baseStyle,
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

    await this.repo.appendAppearanceProfile({
      characterId: character.id,
      appearancePrompt: compiled.appearancePrompt,
      imageR2Key: generated.imageR2Key,
      imageUrl: generated.imageUrl,
      faceKeypoints: generated.faceKeypoints,
    });

    return ok({ characterId: character.id });
  }
}

/**
 * LookupResolver — a narrow port used only by CreateCharacterDraftUseCase.
 * Concrete implementation lives in infrastructure and reads the seeded
 * lookup tables via Prisma.
 */
export interface LookupResolver {
  resolve(input: {
    personalitySlug: string;
    relationshipSlug: string;
    occupationSlug: string;
    voiceSlug: string;
  }): Promise<
    Result<
      {
        personality: { id: string; displayName: string; promptFragment: string };
        relationship: { id: string; displayName: string; promptFragment: string };
        occupation: { id: string; displayName: string; promptFragment: string };
        voice: { id: string; displayName: string };
      },
      LookupNotFoundError
    >
  >;
}
