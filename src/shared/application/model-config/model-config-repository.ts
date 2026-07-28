import "server-only";
import type { ModelPurpose } from "@prisma/client";
import type { ResolvedModel } from "./model-config.dto";

/**
 * ModelConfigRepository — port for reading admin-tunable model configuration.
 *
 * ISP: exposes only what hot-path adapters need. Admin-write operations live
 * on a separate port (added when the /admin/models UI ships).
 */
export interface ModelConfigRepository {
  /**
   * Returns the currently-active {@link ResolvedModel} for the given purpose.
   * Throws {@link ModelNotConfiguredError} if the row is missing or inactive.
   *
   * Implementations SHOULD cache internally; this is called on every LLM turn.
   */
  resolve(purpose: ModelPurpose): Promise<ResolvedModel>;
}
