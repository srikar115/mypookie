import type {
  BaseStyle,
  BodyType,
  CharacterModerationStatus,
  CharacterStatus,
  CharacterVisibility,
  Ethnicity,
  EyeColor,
  Gender,
  HairColor,
  HairStyle,
  SizeTier,
} from "../../domain/entities/character";

/**
 * Serializable view of a Character for the presentation layer. Contains
 * everything a page needs to render — no methods, no domain classes. Any
 * client component receiving this DTO can pass through server-to-client
 * boundary safely.
 */
export interface CharacterDto {
  readonly id: string;
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
  };
  readonly personality: {
    readonly personalityArchetypeId: string;
    readonly personalityLabel: string;
    readonly relationshipArchetypeId: string;
    readonly relationshipLabel: string;
    readonly occupationId: string;
    readonly occupationLabel: string;
    readonly voicePresetId: string;
    readonly voiceLabel: string;
    readonly flirtation: number;
    readonly patience: number;
    readonly moodVolatility: number;
    readonly dominance: number;
  };
  readonly hobbies: readonly string[];
  readonly tags: readonly string[];
  readonly language: string;
  readonly nsfwOptIn: boolean;
  readonly tagline: string | null;
  readonly backstory: string | null;
  readonly bio: string | null;
  readonly status: CharacterStatus;
  readonly regenerationCount: number;
  readonly regenerationsRemaining: number;
  readonly imageUrl: string | null;
  readonly imageVersion: number | null;
  readonly visibility: CharacterVisibility;
  readonly moderationStatus: CharacterModerationStatus;
  readonly createdAt: string;
  readonly committedAt: string | null;
}
