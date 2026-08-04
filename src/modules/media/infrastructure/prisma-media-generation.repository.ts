import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  MediaGenerationRepository,
  CreateMediaGenerationInput,
  UpdateMediaGenerationInput,
} from "../application/ports/media-generation-repository";
import type { MediaGenerationDto, MediaStatusDto, RecentMediaItem } from "../application/dto/media-generation.dto";
import type { MediaGenerationMetadata, MediaGenerationStatus, MediaKind } from "../domain/media-generation";

export class PrismaMediaGenerationRepository implements MediaGenerationRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateMediaGenerationInput): Promise<MediaGenerationDto> {
    const row = await this.db.mediaGeneration.create({
      data: {
        id: input.id,
        userId: input.userId,
        characterId: input.characterId,
        conversationId: input.conversationId,
        kind: input.kind,
        status: "PENDING",
        prompt: input.prompt,
        costCredits: input.costCredits,
        metadata: input.metadata as object,
      },
    });
    return toDto(row);
  }

  async findById(id: string): Promise<MediaGenerationDto | null> {
    const row = await this.db.mediaGeneration.findUnique({ where: { id } });
    return row ? toDto(row) : null;
  }

  async update(input: UpdateMediaGenerationInput): Promise<MediaGenerationDto> {
    const data: Record<string, unknown> = {
      status: input.status,
      updatedAt: new Date(),
    };
    if (input.finalPrompt !== undefined) data.finalPrompt = input.finalPrompt;
    if (input.modelSlug !== undefined) data.modelSlug = input.modelSlug;
    if (input.providerRequestId !== undefined) data.providerRequestId = input.providerRequestId;
    if (input.storageKey !== undefined) data.storageKey = input.storageKey;
    if (input.storageUrl !== undefined) data.storageUrl = input.storageUrl;
    if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;
    if (input.metadata !== undefined) data.metadata = input.metadata as object;
    if (input.completedAt !== undefined) data.completedAt = input.completedAt;

    const row = await this.db.mediaGeneration.update({
      where: { id: input.id },
      data,
    });
    return toDto(row);
  }

  async getStatus(id: string): Promise<MediaStatusDto | null> {
    const row = await this.db.mediaGeneration.findUnique({
      where: { id },
      select: { id: true, status: true, storageUrl: true, errorMessage: true, kind: true, costCredits: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status as MediaGenerationStatus,
      storageUrl: row.storageUrl,
      errorMessage: row.errorMessage,
      kind: row.kind as MediaKind,
      costCredits: row.costCredits,
    };
  }

  async listRecentCompleted(
    userId: string,
    characterId: string,
    limit: number,
  ): Promise<RecentMediaItem[]> {
    const rows = await this.db.mediaGeneration.findMany({
      where: {
        userId,
        characterId,
        status: "COMPLETED",
        kind: "IMAGE",
        storageUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, storageUrl: true, kind: true, createdAt: true },
    });

    return rows
      .filter((r) => r.storageUrl !== null)
      .map((r) => ({
        id: r.id,
        storageUrl: r.storageUrl!,
        kind: r.kind as MediaKind,
        createdAt: r.createdAt,
      }));
  }
}

function toDto(row: {
  id: string;
  userId: string;
  characterId: string;
  conversationId: string;
  kind: string;
  status: string;
  prompt: string;
  finalPrompt: string | null;
  modelSlug: string | null;
  providerRequestId: string | null;
  storageKey: string | null;
  storageUrl: string | null;
  costCredits: number;
  metadata: unknown;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): MediaGenerationDto {
  return {
    id: row.id,
    userId: row.userId,
    characterId: row.characterId,
    conversationId: row.conversationId,
    kind: row.kind as MediaKind,
    status: row.status as MediaGenerationStatus,
    prompt: row.prompt,
    finalPrompt: row.finalPrompt,
    modelSlug: row.modelSlug,
    providerRequestId: row.providerRequestId,
    storageKey: row.storageKey,
    storageUrl: row.storageUrl,
    costCredits: row.costCredits,
    metadata: (row.metadata as MediaGenerationMetadata) ?? {},
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}
