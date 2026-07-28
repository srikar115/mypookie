import type { CompiledPrompts } from "../../domain/entities/character";

/**
 * Input shape carrying every wizard answer that could influence the compiled
 * system / appearance / bio prompts. Kept as plain data so the port has no
 * dependency on the Character entity or its constructor.
 */
export interface PromptCompilerInput {
  readonly name: string;
  readonly appearance: {
    readonly baseStyle: string;
    readonly ethnicity: string;
    readonly gender: string;
    readonly ageYears: number;
    readonly eyeColor: string;
    readonly hairStyle: string;
    readonly hairColor: string;
    readonly bodyType: string;
    readonly bustSize: string | null;
    readonly hipSize: string | null;
    readonly clothing: string | null;
  };
  readonly personality: {
    readonly personalityFragment: string;
    readonly relationshipFragment: string;
    readonly occupationFragment: string;
    readonly personalityLabel: string;
    readonly relationshipLabel: string;
    readonly occupationLabel: string;
  };
  readonly hobbies: readonly string[];
  readonly language: string;
  readonly nsfwOptIn: boolean;
  readonly backstory: string | null;
  readonly now: Date;
}

/**
 * Compiles the three artifacts stored on `characters` (systemPrompt +
 * appearancePrompt + bio) from a single wizard input. Deterministic — same
 * input always yields the same output, so tests can pin exact strings.
 */
export interface PromptCompiler {
  compile(input: PromptCompilerInput): CompiledPrompts;
}
