import "server-only";
import type { MediaKind } from "../../domain/media-generation";

export interface GenerateMediaInput {
  readonly modelSlug: string;
  readonly prompt: string;
  readonly kind: MediaKind;
  readonly aspectRatio: string;
  readonly style: string | null;
  readonly referenceImageUrl: string | null;
  readonly seed: number | null;
  /** Duration in seconds — only used for video. */
  readonly duration?: number;
  /** e.g. "720p" — only used for video. */
  readonly resolution?: string;
}

export interface GenerateMediaResult {
  readonly storageKey: string;
  readonly storageUrl: string;
  readonly providerRequestId: string;
  readonly seed: number | null;
  readonly finalModelSlug: string;
}

export interface MediaImageGenerator {
  generate(input: GenerateMediaInput): Promise<GenerateMediaResult>;
}
