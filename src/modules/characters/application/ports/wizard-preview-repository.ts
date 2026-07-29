import type { BaseStyle, Gender } from "../../domain/entities/character";

/**
 * Discriminates a preview by which wizard step it belongs to. Kept as a
 * plain string union so the repository interface has zero dependency on
 * the Prisma-generated `WizardOptionType` enum (rule: no @prisma/client
 * imports in the application layer).
 */
export type WizardOptionType =
  | "GENDER"
  | "LOOK"
  | "BOND"
  | "PERSONALITY"
  | "AGE_BUCKET"
  | "ETHNICITY"
  | "HAIR_COLOR"
  | "HAIR_STYLE"
  | "EYE_COLOR"
  | "BODY_TYPE"
  | "FASHION";

/** A single wizard-tile preview image, ready to render. */
export interface WizardPreviewRow {
  readonly optionType: WizardOptionType;
  /**
   * The DB enum value or slug this preview represents — e.g. `"FEMALE"`,
   * `"BLONDE"`, `"CASUAL_CHIC"`, `"romantic-flirt"`. Kept as a raw string
   * because the wizard renders across heterogeneous option sources.
   */
  readonly optionValue: string;
  readonly baseStyle: BaseStyle;
  readonly gender: Gender;
  readonly imageUrl: string;
}

/**
 * Fetch shape for the wizard boot: give me every preview I can show for
 * a specific (baseStyle, gender) context, indexed by (optionType,
 * optionValue). The wizard hydrates its tiles from this in one round-trip.
 */
export interface WizardPreviewLookup {
  /**
   * Returns the image url for a single tile, or null when no preview has
   * been seeded yet. Callers fall back to icon/label rendering.
   */
  get(optionType: WizardOptionType, optionValue: string): string | null;
  /** Returns every row bundled into this lookup — useful for admin views. */
  all(): readonly WizardPreviewRow[];
}

/**
 * Read-only port for wizard preview images. Populated by the offline
 * admin seeder (Phase 3); consumed by the /create page's server component
 * during the wizard boot fetch.
 *
 * Deliberately narrow: no per-row writes, no updates, no deletes. Admins
 * regenerate previews by re-running the seeder script.
 */
export interface WizardPreviewRepository {
  /**
   * Fetch every preview scoped to a (baseStyle, gender) tuple and return
   * a lookup object for O(1) per-tile access. Both style and gender fall
   * back gracefully — if the seeder hasn't populated a row for the exact
   * combo, `get()` returns null and the wizard renders the text label.
   */
  listForContext(input: {
    readonly baseStyle: BaseStyle;
    readonly gender: Gender;
  }): Promise<WizardPreviewLookup>;

  /**
   * Fetch every seeded preview across all contexts — used by the admin
   * seeder script's coverage report and by tooling. Do not call from the
   * hot wizard-boot path; use `listForContext` instead.
   */
  listAll(): Promise<readonly WizardPreviewRow[]>;
}
