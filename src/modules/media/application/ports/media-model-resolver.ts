import "server-only";
import type { MediaKind } from "../../domain/media-generation";

export interface MediaModelResolver {
  /**
   * Resolves the model slug for a given kind.
   *
   * Resolution order:
   *   1. User AI prefs override (user_ai_prefs.imageModel / videoModel)
   *   2. Admin default from model_configs (CHAT_IMAGE_EDIT / CHAT_VIDEO_TEXT_TO_VIDEO)
   *   3. Hardcoded fallback from src/config/media.ts
   */
  resolve(kind: MediaKind, userId: string): Promise<string>;
}
