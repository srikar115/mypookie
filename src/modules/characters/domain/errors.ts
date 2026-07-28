/**
 * Domain-layer error types for the characters module. Framework-free — no
 * `next/*`, no HTTP status codes, no toast strings. Use-cases return these
 * via `Result<T, E>`; the presentation layer maps them to user-facing copy.
 */

export class InvalidCharacterNameError extends Error {
  readonly _tag = "InvalidCharacterNameError" as const;
  constructor(message = "Character name must be 2-30 characters.") {
    super(message);
    this.name = "InvalidCharacterNameError";
  }
}

export class InvalidAgeYearsError extends Error {
  readonly _tag = "InvalidAgeYearsError" as const;
  constructor(message = "Character age must be between 18 and 99.") {
    super(message);
    this.name = "InvalidAgeYearsError";
  }
}

export class InvalidHobbiesError extends Error {
  readonly _tag = "InvalidHobbiesError" as const;
  constructor(message = "A character can have up to 3 hobbies.") {
    super(message);
    this.name = "InvalidHobbiesError";
  }
}

export class CharacterNotFoundError extends Error {
  readonly _tag = "CharacterNotFoundError" as const;
  constructor(id: string) {
    super(`Character not found: ${id}`);
    this.name = "CharacterNotFoundError";
  }
}

export class CharacterAccessDeniedError extends Error {
  readonly _tag = "CharacterAccessDeniedError" as const;
  constructor() {
    super("You do not have access to this character.");
    this.name = "CharacterAccessDeniedError";
  }
}

export class RegenerationLimitReachedError extends Error {
  readonly _tag = "RegenerationLimitReachedError" as const;
  constructor() {
    super("You've used your regenerations for this character.");
    this.name = "RegenerationLimitReachedError";
  }
}

export class CharacterAlreadyCommittedError extends Error {
  readonly _tag = "CharacterAlreadyCommittedError" as const;
  constructor() {
    super("This character has already been brought to life.");
    this.name = "CharacterAlreadyCommittedError";
  }
}

export class LookupNotFoundError extends Error {
  readonly _tag = "LookupNotFoundError" as const;
  constructor(kind: "personality" | "relationship" | "occupation" | "voice", slug: string) {
    super(`${kind} '${slug}' is not a recognized option.`);
    this.name = "LookupNotFoundError";
  }
}

export class ImageGenerationFailedError extends Error {
  readonly _tag = "ImageGenerationFailedError" as const;
  constructor(message = "Image generation failed. Please try again.") {
    super(message);
    this.name = "ImageGenerationFailedError";
  }
}

export type CharacterDomainError =
  | InvalidCharacterNameError
  | InvalidAgeYearsError
  | InvalidHobbiesError
  | CharacterNotFoundError
  | CharacterAccessDeniedError
  | RegenerationLimitReachedError
  | CharacterAlreadyCommittedError
  | LookupNotFoundError
  | ImageGenerationFailedError;
