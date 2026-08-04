import "server-only";
import type { MediaGenerationRepository } from "../ports/media-generation-repository";
import type { RecentMediaItem } from "../dto/media-generation.dto";

export class ListRecentMediaUseCase {
  constructor(private readonly mediaRepo: MediaGenerationRepository) {}

  async execute(
    userId: string,
    characterId: string,
    limit = 9,
  ): Promise<RecentMediaItem[]> {
    return this.mediaRepo.listRecentCompleted(userId, characterId, limit);
  }
}
