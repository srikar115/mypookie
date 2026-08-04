import type { MediaGenerationMetadata, MediaGenerationStatus, MediaKind } from "../../domain/media-generation";

export interface MediaGenerationDto {
  readonly id: string;
  readonly userId: string;
  readonly characterId: string;
  readonly conversationId: string;
  readonly kind: MediaKind;
  readonly status: MediaGenerationStatus;
  readonly prompt: string;
  readonly finalPrompt: string | null;
  readonly modelSlug: string | null;
  readonly providerRequestId: string | null;
  readonly storageKey: string | null;
  readonly storageUrl: string | null;
  readonly costCredits: number;
  readonly metadata: MediaGenerationMetadata;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface StartMediaInput {
  readonly actorUserId: string;
  readonly conversationId: string;
  readonly kind: MediaKind;
  readonly prompt: string;
  readonly aspectRatio: string;
  readonly style: string | null;
  readonly editMode: boolean;
  readonly referenceMediaId: string | null;
  /**
   * Text to record as a USER message ahead of the assistant placeholder, or
   * null to record nothing.
   *
   * Set when the request never went through the chat stream — the user picked
   * the Image/Video pill, so their words became a generation prompt rather than
   * a message, and the thread would otherwise show a photo arriving with
   * nothing that asked for it.
   *
   * Deliberately separate from `prompt`: what the provider needs and what reads
   * well in a transcript are not the same string. `prompt` may carry a resolved
   * identity core the user never typed, and showing that back to them as their
   * own message would be nonsense.
   *
   * Null for the classifier and <<VA>> sentinel paths, where the chat stream
   * has already persisted the user's message.
   */
  readonly userPromptText: string | null;
  /**
   * Send `prompt` to the provider verbatim.
   *
   * Set by the mode pill (the textarea *is* the prompt) and by the composer
   * (whose textarea was prefilled with the exact text that would be sent, and
   * may since have been edited). Left false for the classifier and <<VA>>
   * paths, which have no UI to review the prompt and so still need an identity
   * core when there's no reference image to carry her likeness.
   */
  readonly promptIsFinal: boolean;
  /** Model family chosen in the composer. Null → configured default. */
  readonly modelFamilyId: string | null;
  /** Video only; ignored for images. */
  readonly resolution: string | null;
  readonly duration: number | null;
}

export interface PreviewMediaPromptInput {
  readonly actorUserId: string;
  readonly conversationId: string;
  readonly scene: string;
  readonly kind: MediaKind;
  readonly referenceMediaId: string | null;
}

export interface PreviewMediaPromptResult {
  /** Exactly what would be sent to the provider for this request. */
  readonly prompt: string;
  /** Whether a reference image was found, so the UI can say so. */
  readonly hasReference: boolean;
}

export interface StartMediaResult {
  readonly mediaId: string;
  readonly messageId: string;
  readonly costCredits: number;
  /** Non-null only when `userPromptText` was provided. */
  readonly userMessageId: string | null;
}

export interface RunMediaInput {
  readonly mediaId: string;
  readonly actorUserId: string;
}

export interface MediaStatusDto {
  readonly id: string;
  readonly status: MediaGenerationStatus;
  readonly storageUrl: string | null;
  readonly errorMessage: string | null;
  readonly kind: MediaKind;
  readonly costCredits: number;
}

export interface RecentMediaItem {
  readonly id: string;
  readonly storageUrl: string;
  readonly kind: MediaKind;
  readonly createdAt: Date;
}
