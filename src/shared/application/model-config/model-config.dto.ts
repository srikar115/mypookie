import "server-only";
import type { ModelProvider, ModelPurpose } from "@prisma/client";

/**
 * ResolvedModel — the shape every LLM/image adapter reads to construct its
 * client and pick a modelId. Snapshotted from a `model_configs` row via the
 * `ModelConfigRepository` port.
 *
 * `parameters` is a free-form key/value bag; each adapter documents which
 * keys it consumes (e.g. OpenRouter honours `temperature`, `top_p`,
 * `max_tokens`, `response_format`; Fal honours `num_inference_steps`,
 * `strength`, `image_size`, `enable_safety_checker`).
 */
export interface ResolvedModel {
  readonly purpose: ModelPurpose;
  readonly provider: ModelProvider;
  readonly modelId: string;
  readonly endpoint: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly label: string;
}

export type { ModelProvider, ModelPurpose } from "@prisma/client";
