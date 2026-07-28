import { z } from "zod";

/**
 * Presentation-layer validation for the wizard payload. This runs INSIDE the
 * Server Action (rule 5 — never trust the client). The output shape is what
 * the CreateCharacterDraftUseCase expects.
 */

export const baseStyleEnum = z.enum(["REALISTIC", "ANIME", "THREE_D", "CARTOON"]);
export const ethnicityEnum = z.enum([
  "CAUCASIAN",
  "LATINA",
  "ASIAN",
  "ARAB",
  "EBONY",
  "MIXED",
  "OTHER",
]);
export const genderEnum = z.enum(["FEMALE", "MALE", "NONBINARY"]);
export const eyeColorEnum = z.enum([
  "BROWN",
  "BLUE",
  "GREEN",
  "HAZEL",
  "AMBER",
  "GRAY",
  "VIOLET",
  "HETEROCHROMIA",
]);
export const hairStyleEnum = z.enum([
  "STRAIGHT",
  "WAVY",
  "CURLY",
  "BANGS",
  "PONYTAIL",
  "BOB",
  "PIXIE",
  "BRAIDS",
  "UPDO",
]);
export const hairColorEnum = z.enum([
  "BLACK",
  "BROWN",
  "BLONDE",
  "RED",
  "AUBURN",
  "WHITE",
  "SILVER",
  "PINK",
  "PURPLE",
  "BLUE",
  "FANTASY_OTHER",
]);
export const bodyTypeEnum = z.enum([
  "SLIM",
  "ATHLETIC",
  "CURVY",
  "PLUS_SIZE",
  "PETITE",
  "VOLUPTUOUS",
]);
export const sizeTierEnum = z.enum(["XS", "S", "M", "L", "XL"]);

export const wizardPayloadSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(30),
  appearance: z.object({
    baseStyle: baseStyleEnum,
    ethnicity: ethnicityEnum,
    gender: genderEnum,
    ageYears: z.coerce.number().int().min(18).max(99),
    eyeColor: eyeColorEnum,
    hairStyle: hairStyleEnum,
    hairColor: hairColorEnum,
    bodyType: bodyTypeEnum,
    bustSize: sizeTierEnum.nullable().optional().default(null),
    hipSize: sizeTierEnum.nullable().optional().default(null),
    clothing: z.string().trim().max(200).nullable().optional().default(null),
  }),
  personalitySlug: z.string().trim().min(1),
  relationshipSlug: z.string().trim().min(1),
  occupationSlug: z.string().trim().min(1),
  voiceSlug: z.string().trim().min(1),
  hobbies: z
    .array(z.string().trim().min(1).max(40))
    .max(3, "You can pick up to 3 hobbies")
    .default([]),
  language: z.string().trim().min(2).max(8).default("en"),
  nsfwOptIn: z.boolean().default(false),
  backstory: z.string().trim().max(2000).nullable().optional().default(null),
});

export type WizardPayload = z.infer<typeof wizardPayloadSchema>;

export const regeneratePayloadSchema = z.object({
  characterId: z.string().uuid(),
});

export const commitPayloadSchema = z.object({
  characterId: z.string().uuid(),
});
