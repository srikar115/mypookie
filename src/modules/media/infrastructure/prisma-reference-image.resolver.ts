import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { ReferenceImageResolver } from "../application/ports/reference-image-resolver";
import { generateSignedUrl, getFileUrl } from "@/shared/infrastructure/storage/r2";

export class PrismaReferenceImageResolver implements ReferenceImageResolver {
  constructor(private readonly db: PrismaClient) {}

  async resolve(input: {
    referenceMediaId: string | null;
    userId: string;
    characterId: string;
    conversationId: string;
  }): Promise<string | null> {
    // 1. Explicit referenceMediaId from the composer.
    if (input.referenceMediaId) {
      const media = await this.db.mediaGeneration.findFirst({
        where: {
          id: input.referenceMediaId,
          userId: input.userId,
          status: "COMPLETED",
          kind: "IMAGE",
        },
        select: { storageKey: true, storageUrl: true },
      });
      if (media?.storageKey) {
        return await generateSignedUrl(media.storageKey);
      }
      if (media?.storageUrl) return media.storageUrl;
    }

    // 2. Latest completed image for this user+companion in the conversation.
    const lastMedia = await this.db.mediaGeneration.findFirst({
      where: {
        userId: input.userId,
        characterId: input.characterId,
        status: "COMPLETED",
        kind: "IMAGE",
        storageUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { storageKey: true, storageUrl: true },
    });
    if (lastMedia?.storageKey) {
      return await generateSignedUrl(lastMedia.storageKey);
    }
    if (lastMedia?.storageUrl) return lastMedia.storageUrl;

    // 3. Companion avatar / appearance profile reference image.
    const profile = await this.db.characterAppearanceProfile.findFirst({
      where: { characterId: input.characterId, isActive: true },
      select: { referenceImageR2Key: true },
    });
    if (profile?.referenceImageR2Key) {
      return await getFileUrl(profile.referenceImageR2Key);
    }

    return null;
  }
}
