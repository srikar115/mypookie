import "server-only";
import type { MediaGenerationRepository } from "../ports/media-generation-repository";
import type { MediaStatusDto } from "../dto/media-generation.dto";
import { MediaGenerationNotFoundError, MediaGenerationAccessDeniedError } from "../../domain/media-generation";

export class GetMediaStatusUseCase {
  constructor(private readonly mediaRepo: MediaGenerationRepository) {}

  async execute(mediaId: string, actorUserId: string): Promise<MediaStatusDto> {
    const status = await this.mediaRepo.getStatus(mediaId);
    if (!status) throw new MediaGenerationNotFoundError(mediaId);

    // Security: fetch full record to check ownership.
    const gen = await this.mediaRepo.findById(mediaId);
    if (!gen || gen.userId !== actorUserId) throw new MediaGenerationAccessDeniedError();

    return status;
  }
}
