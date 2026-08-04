import "server-only";
import type { MediaGenerationDto, MediaStatusDto, RecentMediaItem } from "../dto/media-generation.dto";
import type { MediaGenerationMetadata, MediaGenerationStatus, MediaKind } from "../../domain/media-generation";

export interface CreateMediaGenerationInput {
  id: string;
  userId: string;
  characterId: string;
  conversationId: string;
  kind: MediaKind;
  prompt: string;
  costCredits: number;
  metadata: MediaGenerationMetadata;
}

export interface UpdateMediaGenerationInput {
  id: string;
  status: MediaGenerationStatus;
  finalPrompt?: string;
  modelSlug?: string;
  providerRequestId?: string;
  storageKey?: string;
  storageUrl?: string;
  errorMessage?: string;
  metadata?: MediaGenerationMetadata;
  completedAt?: Date;
}

export interface MediaGenerationRepository {
  create(input: CreateMediaGenerationInput): Promise<MediaGenerationDto>;
  findById(id: string): Promise<MediaGenerationDto | null>;
  update(input: UpdateMediaGenerationInput): Promise<MediaGenerationDto>;
  getStatus(id: string): Promise<MediaStatusDto | null>;
  listRecentCompleted(
    userId: string,
    characterId: string,
    limit: number,
  ): Promise<RecentMediaItem[]>;
}
