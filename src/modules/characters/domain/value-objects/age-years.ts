import { InvalidAgeYearsError } from "../errors";

/**
 * Age in whole years. The 18 floor is a legal invariant (product-research
 * §9.1) and matches the CHECK constraint on `characters.age_years`.
 */
export class AgeYears {
  private constructor(public readonly value: number) {}

  static create(raw: number): AgeYears {
    if (!Number.isInteger(raw) || raw < 18 || raw > 99) {
      throw new InvalidAgeYearsError();
    }
    return new AgeYears(raw);
  }

  /**
   * Derive a stable birthdate for storage. We anchor the day to Jan 1 of the
   * inferred birth year so age math stays consistent regardless of when the
   * character was created.
   */
  toBirthdate(referenceYear: number): Date {
    return new Date(Date.UTC(referenceYear - this.value, 0, 1));
  }
}
