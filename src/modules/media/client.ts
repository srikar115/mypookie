/**
 * media module — client-safe public API.
 *
 * Only client-safe exports (no "server-only" imports anywhere in the chain).
 * Client Components import from "@/modules/media/client".
 */
export { classifyIntent, needsCompose } from "./domain/visual-intent";
export type { IntentDecision, VisualIntent } from "./domain/visual-intent";
export type { MediaKind, MediaGenerationStatus } from "./domain/media-generation";
export type { MediaStatusDto, RecentMediaItem } from "./application/dto/media-generation.dto";
export type { StartMediaResult } from "./application/dto/media-generation.dto";

// Presentation components and hooks (client-safe).
export { MediaBubble } from "./presentation/components/MediaBubble";
export { MediaComposer } from "./presentation/components/MediaComposer";
export type { GeneratePayload } from "./presentation/components/MediaComposer";
export { ClarifyBubble } from "./presentation/components/ClarifyBubble";
export { OfferBubble } from "./presentation/components/OfferBubble";
export { ComposerModePills } from "./presentation/components/ComposerModePills";
export { useMediaGeneration } from "./presentation/hooks/useMediaGeneration";

// Server Action, re-exported for Client Components. The "use server" directive
// in the target file makes Next.js replace it with a client reference in the
// browser bundle, so none of its server-only imports reach the client graph.
// It must NOT be reached via "@/modules/media" from a client component — that
// barrel also exports composition factories, which pull in `server-only`.
export { startMediaGenerationAction } from "./presentation/actions/start-media-generation.action";
export type { StartMediaActionResult } from "./presentation/actions/start-media-generation.action";
export { previewMediaPromptAction } from "./presentation/actions/preview-media-prompt.action";
export type { PreviewMediaPromptActionResult } from "./presentation/actions/preview-media-prompt.action";
export { listRecentMediaAction } from "./presentation/actions/list-recent-media.action";
export type { ListRecentMediaActionResult } from "./presentation/actions/list-recent-media.action";
