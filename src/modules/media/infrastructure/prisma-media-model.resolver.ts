import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { MediaModelResolver } from "../application/ports/media-model-resolver";
import type { MediaKind } from "../domain/media-generation";
import {
  DEFAULT_CHAT_IMAGE_MODEL,
  DEFAULT_CHAT_VIDEO_MODEL,
} from "@/config/media";

export class PrismaMediaModelResolver implements MediaModelResolver {
  constructor(private readonly db: PrismaClient) {}

  async resolve(kind: MediaKind, userId: string): Promise<string> {
    // 1. User AI prefs override.
    const prefs = await this.db.userAiPrefs.findUnique({
      where: { userId },
      select: { imageModel: true, videoModel: true },
    });
    const userSlug = kind === "IMAGE" ? prefs?.imageModel : prefs?.videoModel;
    if (userSlug) return userSlug;

    // 2. Admin default from model_configs.
    const purpose = kind === "IMAGE" ? "CHAT_IMAGE_EDIT" : "CHAT_VIDEO_TEXT_TO_VIDEO";
    const config = await this.db.modelConfig.findUnique({
      where: { purpose },
      select: { modelId: true, isActive: true },
    });
    if (config?.isActive && config.modelId) return config.modelId;

    // 3. Hardcoded fallback.
    return kind === "IMAGE" ? DEFAULT_CHAT_IMAGE_MODEL : DEFAULT_CHAT_VIDEO_MODEL;
  }
}
