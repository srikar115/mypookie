import { InvalidHobbiesError } from "../errors";

/**
 * Up to 3 hobbies, matching the CHECK constraint on `characters.hobbies` and
 * candy.ai's wizard limit (product-research §2.1 step 13).
 */
export class Hobbies {
  private constructor(public readonly values: readonly string[]) {}

  static create(raw: readonly string[]): Hobbies {
    const cleaned = raw
      .map((h) => h.trim())
      .filter((h) => h.length > 0 && h.length <= 40);
    if (cleaned.length > 3) {
      throw new InvalidHobbiesError();
    }
    return new Hobbies(cleaned);
  }

  static empty(): Hobbies {
    return new Hobbies([]);
  }

  toArray(): string[] {
    return [...this.values];
  }
}
