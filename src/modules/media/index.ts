/**
 * media module — server public API.
 *
 * Only symbols exported from this file may be imported by other modules or
 * by the delivery layer (app/). Deep imports into media/domain, media/application,
 * media/infrastructure, or media/composition are forbidden by the ESLint
 * architecture-boundary rules.
 */
export {
  createStartMediaGenerationUseCase,
  createRunMediaGenerationUseCase,
  createPreviewMediaPromptUseCase,
  createGetMediaStatusUseCase,
  createListRecentMediaUseCase,
} from "./composition/media.dependencies";

export { startMediaGenerationAction } from "./presentation/actions/start-media-generation.action";
export { previewMediaPromptAction } from "./presentation/actions/preview-media-prompt.action";
export { listRecentMediaAction } from "./presentation/actions/list-recent-media.action";

export type { MediaGenerationDto, StartMediaInput, StartMediaResult, MediaStatusDto, RecentMediaItem, PreviewMediaPromptInput, PreviewMediaPromptResult } from "./application/dto/media-generation.dto";
export type { MediaKind, MediaGenerationStatus } from "./domain/media-generation";
export { InsufficientCreditsError, MediaGenerationNotFoundError, MediaGenerationAccessDeniedError } from "./domain/media-generation";
