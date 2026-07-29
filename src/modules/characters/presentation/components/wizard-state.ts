/**
 * Wizard v2 draft state — Candy.ai-style 11-step unified flow.
 *
 * Every step patches into this single draft object. Field ordering here
 * matches the step order (gender → look → bond → … → details) so the
 * flow is obvious at a glance.
 *
 * A field is `null` until the corresponding step is completed. The
 * `isStepXComplete` helpers are the guards for advancing to the next
 * step.
 */

import type {
  BaseStyle,
  BodyType,
  Ethnicity,
  EyeColor,
  FashionStyle,
  Gender,
  HairColor,
  HairStyle,
  SizeTier,
} from "../../domain/entities/character";

/**
 * Discrete age buckets shown to the user. Each maps to a concrete
 * default age we send to the backend — chosen as the midpoint of the
 * bucket so most-likely intent lines up with the visual grouping.
 */
export type AgeBucket = "18-24" | "25-30" | "31-40" | "41+";

export const AGE_BUCKET_ORDER: readonly AgeBucket[] = ["18-24", "25-30", "31-40", "41+"];

export const AGE_BUCKET_DEFAULT_YEARS: Record<AgeBucket, number> = {
  "18-24": 22,
  "25-30": 27,
  "31-40": 34,
  "41+": 45,
};

/**
 * Step machine. The visual (Candy-numbered) steps are 1-11; `progress`
 * and `preview` are terminal screens that come after step 11.
 */
export type WizardStep =
  | "gender"
  | "look"
  | "bond"
  | "personality"
  | "age"
  | "heritage"
  | "hair"
  | "eyes"
  | "body"
  | "fashion"
  | "details"
  | "progress"
  | "preview";

export const WIZARD_STEP_ORDER: readonly WizardStep[] = [
  "gender",
  "look",
  "bond",
  "personality",
  "age",
  "heritage",
  "hair",
  "eyes",
  "body",
  "fashion",
  "details",
];

/** Total number shown as "Step X of N" in the progress pill. */
export const WIZARD_TOTAL_STEPS = WIZARD_STEP_ORDER.length;

export interface WizardDraft {
  // Step 1 — Gender
  gender: Gender | null;
  // Step 2 — Look (Realistic vs Animated)
  baseStyle: BaseStyle | null;
  // Step 3 — Bond (relationship archetype slug)
  relationshipSlug: string | null;
  // Step 4 — Personality (archetype slug)
  personalitySlug: string | null;
  // Step 5 — Age
  ageBucket: AgeBucket | null;
  ageYears: number;
  // Step 6 — Heritage (ethnicity)
  ethnicity: Ethnicity | null;
  // Step 7 — Hair (color + style, same page)
  hairColor: HairColor | null;
  hairStyle: HairStyle | null;
  // Step 8 — Eyes
  eyeColor: EyeColor | null;
  // Step 9 — Body
  bodyType: BodyType | null;
  bustSize: SizeTier | null;
  hipSize: SizeTier | null;
  // Step 10 — Fashion
  fashionStyle: FashionStyle | null;
  clothing: string;
  // Step 11 — Details (character-level metadata + voice)
  name: string;
  occupationSlug: string | null;
  voiceSlug: string | null;
  hobbies: string[];
  language: string;
  nsfwOptIn: boolean;
  backstory: string;
}

export function emptyDraft(): WizardDraft {
  return {
    gender: null,
    baseStyle: null,
    relationshipSlug: null,
    personalitySlug: null,
    ageBucket: null,
    ageYears: 22,
    ethnicity: null,
    hairColor: null,
    hairStyle: null,
    eyeColor: null,
    bodyType: null,
    bustSize: null,
    hipSize: null,
    fashionStyle: null,
    clothing: "",
    name: "",
    occupationSlug: null,
    voiceSlug: null,
    hobbies: [],
    language: "en",
    // Amorify treats NSFW as a per-message concern the LLM decides in
    // context; the wizard therefore doesn't prompt for it. Every
    // character is created with nsfw allowed and the model itself
    // gates explicit content based on what the user actually asks.
    nsfwOptIn: true,
    backstory: "",
  };
}

/**
 * Per-step completion guards. Each function is the invariant the
 * wizard uses to enable the "Continue" button on that step. Kept
 * separate so unit tests can pin the exact rules.
 */
export const isStepComplete: Record<
  Exclude<WizardStep, "progress" | "preview">,
  (d: WizardDraft) => boolean
> = {
  gender: (d) => d.gender !== null,
  look: (d) => d.baseStyle !== null,
  bond: (d) => d.relationshipSlug !== null,
  personality: (d) => d.personalitySlug !== null,
  age: (d) => d.ageBucket !== null && d.ageYears >= 18 && d.ageYears <= 99,
  heritage: (d) => d.ethnicity !== null,
  hair: (d) => d.hairColor !== null && d.hairStyle !== null,
  eyes: (d) => d.eyeColor !== null,
  body: (d) => d.bodyType !== null,
  fashion: (d) => d.fashionStyle !== null,
  details: (d) =>
    d.name.trim().length >= 2 &&
    d.occupationSlug !== null &&
    d.voiceSlug !== null,
};

/**
 * Female-shaped bodies drive the optional bust/hip fields. Everyone
 * else has them zeroed out; the backend never emits them for MALE /
 * TRANS_MAN presentations. Trans woman inherits FEMALE presentation.
 */
export function bodyMeasurementsAllowed(gender: Gender | null): boolean {
  return gender === "FEMALE" || gender === "TRANS_WOMAN";
}
