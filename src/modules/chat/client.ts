/**
 * Client-side public API for the chat module.
 *
 * The chat module currently has no domain / application / infrastructure
 * layers because there's no persistence yet — this is a UI-only scaffold
 * that consumes `CharacterSummaryDto` from the characters module. When
 * we introduce chat threads, messages, and LLM integration, those layers
 * land alongside this file and a corresponding server-side `index.ts`.
 */
export { ChatWorkspace } from "./presentation/components/ChatWorkspace";
export type { ChatWorkspaceProps } from "./presentation/components/ChatWorkspace";
