/**
 * Wizard lookup DTOs — the four picker lists the wizard needs on load.
 * These are direct projections of the seeded lookup tables (see
 * `20260728060000_seed_character_lookups`).
 */

export interface PersonalityOptionDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string | null;
}

export interface RelationshipOptionDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string | null;
}

export interface OccupationOptionDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly isNsfwOnly: boolean;
}

export interface VoiceOptionDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly tone: string;
  readonly sampleUrl: string | null;
}

export interface CharacterLookupsDto {
  readonly personalities: readonly PersonalityOptionDto[];
  readonly relationships: readonly RelationshipOptionDto[];
  readonly occupations: readonly OccupationOptionDto[];
  readonly voices: readonly VoiceOptionDto[];
}
