import "server-only";

export interface CompanionVisualProfile {
  readonly name: string;
  readonly gender: string;
  readonly ageYears: number;
  readonly ethnicity: string;
  readonly hairStyle: string;
  readonly hairColor: string;
  readonly eyeColor: string;
  readonly bodyType: string;
  readonly bustSize: string | null;
  readonly hipSize: string | null;
  readonly fashionStyle: string | null;
  /** Compiled appearance prompt from characters.appearancePrompt. */
  readonly appearancePrompt: string;
  /** Current reference image URL (from character_appearance_profiles). Null if none. */
  readonly referenceImageUrl: string | null;
}

export interface CompanionVisualProfileReader {
  read(characterId: string): Promise<CompanionVisualProfile | null>;
}
