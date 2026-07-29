import "server-only";
import type {
  BaseStyle,
  Ethnicity,
  Gender,
} from "../../domain/entities/character";

/**
 * TaglineGenerator — port for writing the Candy.ai-style scenario prose
 * that sits under a character's name in the chat sidebar / My AI gallery.
 *
 * Output shape: 2-3 sentences, in second person addressing the user, that
 * paint a relational scenario. Examples the generator should aim toward:
 *
 *   "Your rebellious stepsister. Your parents are gone for the weekend and
 *    you're home alone. She hates you and wants to be independent."
 *
 *   "Passionate student balancing Netflix binges with volunteering and a
 *    commitment to self-development."
 *
 * The concrete implementation resolves an LLM at call time via
 * `ModelConfigRepository` (purpose = `TAGLINE_GENERATOR`) so admins can
 * swap models without a redeploy — same convention as CHAT / EXTRACTOR /
 * SUMMARIZER / EMBEDDING.
 *
 * Failure MUST NOT block character creation. Callers should catch and
 * fall back to a deterministic template bio, so a wobbly upstream
 * provider degrades to "old boring copy" rather than blocking signup.
 */
export interface TaglineGeneratorInput {
  readonly characterName: string;
  readonly ageYears: number;
  readonly gender: Gender;
  readonly baseStyle: BaseStyle;
  readonly ethnicity: Ethnicity;
  readonly personalityLabel: string;
  readonly relationshipLabel: string;
  readonly occupationLabel: string;
  readonly hobbies: readonly string[];
  readonly backstory: string | null;
  readonly nsfwOptIn: boolean;
  readonly language: string;
}

export interface TaglineGeneratorOutput {
  /** The 2-3 sentence scenario copy — plain text, no markdown. */
  readonly tagline: string;
}

export interface TaglineGenerator {
  generate(input: TaglineGeneratorInput): Promise<TaglineGeneratorOutput>;
}
