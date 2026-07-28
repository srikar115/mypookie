import "server-only";
import type { ModelPurpose } from "@prisma/client";

/**
 * Thrown by {@link ModelConfigRepository} when the requested purpose has no
 * active row. Callers surface this as a 500 — the operator has to fix the
 * table (or flip `isActive`) before the feature works. This is a
 * configuration failure, not a user-recoverable error.
 */
export class ModelNotConfiguredError extends Error {
  readonly purpose: ModelPurpose;

  constructor(purpose: ModelPurpose) {
    super(
      `No active model_configs row found for purpose="${purpose}". ` +
        `Seed it or flip isActive=true.`,
    );
    this.name = "ModelNotConfiguredError";
    this.purpose = purpose;
  }
}
