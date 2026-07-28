import { InvalidCharacterNameError } from "../errors";

/**
 * Character display name. Length rule taken from candy.ai's `14/20` counter
 * on the wizard main screen — we allow 2 (minimum useful) to 30 (a bit more
 * generous than 20 to accommodate double first names).
 */
export class CharacterName {
  private constructor(public readonly value: string) {}

  static create(raw: string): CharacterName {
    const trimmed = raw.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      throw new InvalidCharacterNameError();
    }
    return new CharacterName(trimmed);
  }

  equals(other: CharacterName): boolean {
    return this.value === other.value;
  }
}
