/**
 * Character — the aggregate root for the characters module.
 *
 * A Character is a first-class domain concept, not just a database row. The
 * entity carries wizard answers, compiled prompts, lifecycle state, and the
 * business rules that govern draft → active promotion and image regeneration.
 *
 * This file is framework-free: no `@prisma/client`, no `next/*`, no `react`.
 * Persistence adapters map between the entity and the database representation.
 */

import type { CharacterName } from "../value-objects/character-name";
import type { AgeYears } from "../value-objects/age-years";
import type { Hobbies } from "../value-objects/hobbies";
import {
  CharacterAlreadyCommittedError,
  RegenerationLimitReachedError,
} from "../errors";

/** Hard cap on image regenerations during draft creation (screenshot 7). */
export const MAX_REGENERATIONS = 2;

export type CharacterStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CharacterVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type CharacterModerationStatus = "APPROVED" | "UNDER_REVIEW" | "BLOCKED";
export type BaseStyle = "REALISTIC" | "ANIME" | "THREE_D" | "CARTOON";
export type Ethnicity = "CAUCASIAN" | "LATINA" | "ASIAN" | "ARAB" | "EBONY" | "MIXED" | "OTHER";
export type Gender = "FEMALE" | "MALE" | "NONBINARY";
export type EyeColor = "BROWN" | "BLUE" | "GREEN" | "HAZEL" | "AMBER" | "GRAY" | "VIOLET" | "HETEROCHROMIA";
export type HairStyle = "STRAIGHT" | "WAVY" | "CURLY" | "BANGS" | "PONYTAIL" | "BOB" | "PIXIE" | "BRAIDS" | "UPDO";
export type HairColor = "BLACK" | "BROWN" | "BLONDE" | "RED" | "AUBURN" | "WHITE" | "SILVER" | "PINK" | "PURPLE" | "BLUE" | "FANTASY_OTHER";
export type BodyType = "SLIM" | "ATHLETIC" | "CURVY" | "PLUS_SIZE" | "PETITE" | "VOLUPTUOUS";
export type SizeTier = "XS" | "S" | "M" | "L" | "XL";

export interface CharacterAppearance {
  readonly baseStyle: BaseStyle;
  readonly ethnicity: Ethnicity;
  readonly gender: Gender;
  readonly age: AgeYears;
  readonly eyeColor: EyeColor;
  readonly hairStyle: HairStyle;
  readonly hairColor: HairColor;
  readonly bodyType: BodyType;
  readonly bustSize: SizeTier | null;
  readonly hipSize: SizeTier | null;
  readonly clothing: string | null;
}

export interface CharacterPersonality {
  readonly personalityArchetypeId: string;
  readonly relationshipArchetypeId: string;
  readonly occupationId: string;
  readonly voicePresetId: string;
  readonly flirtation: number;
  readonly patience: number;
  readonly moodVolatility: number;
  readonly dominance: number;
}

export interface CompiledPrompts {
  readonly systemPrompt: string;
  readonly appearancePrompt: string;
  readonly bio: string | null;
  readonly compiledAt: Date;
}

export interface CharacterProps {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: CharacterName;
  readonly appearance: CharacterAppearance;
  readonly personality: CharacterPersonality;
  readonly hobbies: Hobbies;
  readonly language: string;
  readonly tags: readonly string[];
  readonly nsfwOptIn: boolean;
  readonly tagline: string | null;
  readonly backstory: string | null;
  readonly prompts: CompiledPrompts;
  readonly status: CharacterStatus;
  readonly regenerationCount: number;
  readonly committedAt: Date | null;
  readonly visibility: CharacterVisibility;
  readonly moderationStatus: CharacterModerationStatus;
  readonly createdAt: Date;
}

export class Character {
  private constructor(private readonly props: CharacterProps) {}

  static rehydrate(props: CharacterProps): Character {
    return new Character(props);
  }

  static createDraft(input: Omit<CharacterProps, "status" | "regenerationCount" | "committedAt" | "visibility" | "moderationStatus" | "createdAt">): Character {
    return new Character({
      ...input,
      status: "DRAFT",
      regenerationCount: 0,
      committedAt: null,
      visibility: "PRIVATE",
      moderationStatus: "APPROVED",
      createdAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get ownerUserId(): string {
    return this.props.ownerUserId;
  }

  get status(): CharacterStatus {
    return this.props.status;
  }

  get regenerationCount(): number {
    return this.props.regenerationCount;
  }

  get name(): CharacterName {
    return this.props.name;
  }

  get appearance(): CharacterAppearance {
    return this.props.appearance;
  }

  get personality(): CharacterPersonality {
    return this.props.personality;
  }

  get hobbies(): Hobbies {
    return this.props.hobbies;
  }

  get prompts(): CompiledPrompts {
    return this.props.prompts;
  }

  get props_(): CharacterProps {
    return this.props;
  }

  /** Only draft characters can accept more regenerations. */
  canRegenerate(): { ok: true } | { ok: false; error: Error } {
    if (this.props.status !== "DRAFT") {
      return { ok: false, error: new CharacterAlreadyCommittedError() };
    }
    if (this.props.regenerationCount >= MAX_REGENERATIONS) {
      return { ok: false, error: new RegenerationLimitReachedError() };
    }
    return { ok: true };
  }

  /** Chat is only allowed against ACTIVE characters (product-research §2.4). */
  canChat(): boolean {
    return this.props.status === "ACTIVE" && this.props.moderationStatus !== "BLOCKED";
  }

  /**
   * DRAFT → ACTIVE transition. Called by the "Bring my AI to Life" commit.
   * The credits debit happens outside the entity in the CommitCharacter use
   * case; this method just enforces the state-machine invariant.
   */
  commit(now: Date): Character {
    if (this.props.status !== "DRAFT") {
      throw new CharacterAlreadyCommittedError();
    }
    return new Character({
      ...this.props,
      status: "ACTIVE",
      committedAt: now,
    });
  }

  /** Record that an image regeneration was consumed. Idempotent for the caller. */
  registerRegeneration(): Character {
    const check = this.canRegenerate();
    if (!check.ok) throw check.error;
    return new Character({
      ...this.props,
      regenerationCount: this.props.regenerationCount + 1,
    });
  }
}
