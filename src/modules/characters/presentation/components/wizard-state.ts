/**
 * Shared TypeScript shapes used across the wizard components. Kept separate
 * so the orchestrator and each step import the same source of truth.
 */

import type {
  BaseStyle,
  BodyType,
  Ethnicity,
  EyeColor,
  Gender,
  HairColor,
  HairStyle,
  SizeTier,
} from "../../domain/entities/character";

export type WizardStep = "style" | "appearance" | "character" | "progress" | "preview";

export interface WizardDraft {
  baseStyle: BaseStyle | null;
  ethnicity: Ethnicity | null;
  gender: Gender;
  ageYears: number;
  eyeColor: EyeColor | null;
  hairStyle: HairStyle | null;
  hairColor: HairColor | null;
  bodyType: BodyType | null;
  bustSize: SizeTier | null;
  hipSize: SizeTier | null;
  clothing: string;
  name: string;
  personalitySlug: string | null;
  relationshipSlug: string | null;
  occupationSlug: string | null;
  voiceSlug: string | null;
  hobbies: string[];
  language: string;
  nsfwOptIn: boolean;
  backstory: string;
}

export function emptyDraft(): WizardDraft {
  return {
    baseStyle: null,
    ethnicity: null,
    gender: "FEMALE",
    ageYears: 22,
    eyeColor: null,
    hairStyle: null,
    hairColor: null,
    bodyType: null,
    bustSize: null,
    hipSize: null,
    clothing: "",
    name: "",
    personalitySlug: null,
    relationshipSlug: null,
    occupationSlug: null,
    voiceSlug: null,
    hobbies: [],
    language: "en",
    nsfwOptIn: false,
    backstory: "",
  };
}

export function isAppearanceComplete(d: WizardDraft): boolean {
  return (
    d.baseStyle !== null &&
    d.ethnicity !== null &&
    d.eyeColor !== null &&
    d.hairStyle !== null &&
    d.hairColor !== null &&
    d.bodyType !== null &&
    d.ageYears >= 18 &&
    d.ageYears <= 99
  );
}

export function isCharacterComplete(d: WizardDraft): boolean {
  return (
    d.name.trim().length >= 2 &&
    d.personalitySlug !== null &&
    d.relationshipSlug !== null &&
    d.occupationSlug !== null &&
    d.voiceSlug !== null
  );
}

/**
 * Map the top-nav category tab (Girls / Anime / Guys) to the wizard's
 * derived baseStyle + gender. Kept as a pure function so it's trivially
 * testable and easily extended when we add new tabs (e.g. "Anime Guys").
 */
export type CategoryTab = "girls" | "anime" | "guys";

export function deriveDraftFromCategory(
  category: CategoryTab,
): Pick<WizardDraft, "baseStyle" | "gender"> {
  switch (category) {
    case "girls":
      return { baseStyle: "REALISTIC", gender: "FEMALE" };
    case "anime":
      return { baseStyle: "ANIME", gender: "FEMALE" };
    case "guys":
      return { baseStyle: "REALISTIC", gender: "MALE" };
  }
}
