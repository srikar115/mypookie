/**
 * Media generation domain types and status transition helpers.
 * Plain TypeScript — no framework, no infrastructure.
 */

export type MediaKind = "IMAGE" | "VIDEO";
export type MediaGenerationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface MediaGenerationMetadata {
  seed?: number;
  style?: string | null;
  aspectRatio?: string;
  editMode?: boolean;
  referenceMediaId?: string | null;
  finalModelSlug?: string;
  /**
   * The prompt was already settled by the caller and must reach the provider
   * unchanged — set for the mode-pill path and for composer submissions, where
   * the user saw (and could edit) the exact text that would be sent.
   */
  promptIsFinal?: boolean;
  /**
   * Model *family* the user picked in the composer (e.g. "wan-2.7"). The
   * concrete endpoint is derived at run time from this plus whether a reference
   * image resolved. Absent means "use the configured default".
   */
  modelFamilyId?: string | null;
  /** Video only. */
  resolution?: string | null;
  duration?: number | null;
}

/** Domain errors */
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

export class MediaGenerationNotFoundError extends Error {
  constructor(id: string) {
    super(`MediaGeneration ${id} not found`);
    this.name = "MediaGenerationNotFoundError";
  }
}

export class MediaGenerationAccessDeniedError extends Error {
  constructor() {
    super("Access denied to media generation");
    this.name = "MediaGenerationAccessDeniedError";
  }
}

/** Validate that a transition is legal. */
export function assertValidTransition(
  from: MediaGenerationStatus,
  to: MediaGenerationStatus,
): void {
  const allowed: Record<MediaGenerationStatus, MediaGenerationStatus[]> = {
    PENDING: ["RUNNING", "FAILED"],
    RUNNING: ["COMPLETED", "FAILED"],
    COMPLETED: [],
    FAILED: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid media generation status transition: ${from} → ${to}`);
  }
}
