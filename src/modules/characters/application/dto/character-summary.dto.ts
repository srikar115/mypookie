/**
 * Compact projection of a Character for list views (chat sidebar, "My AI"
 * gallery, discover feeds). Intentionally omits appearance metrics,
 * personality sliders, prompts, and other heavy fields — those are only
 * needed on detail pages and would waste bandwidth on list responses.
 *
 * Kept alongside CharacterDto so the read model surface stays discoverable.
 */
export interface CharacterSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
  /** Version number of the active appearance profile — powers the "V2" badge on gallery cards. */
  readonly imageVersion: number | null;
  readonly ageYears: number;
  readonly relationshipLabel: string;
  readonly occupationLabel: string;
  readonly personalityLabel: string;
  /** Short one-liner used in the chat sidebar and as a card subtitle. */
  readonly tagline: string | null;
  /** Longer bio (2-3 sentences) used on the My AI gallery card overlay. */
  readonly bio: string | null;
  readonly createdAt: string;
}
