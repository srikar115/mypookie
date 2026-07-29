/**
 * Client-side public API for the chat module.
 *
 * Client components (e.g. the wizard) import server actions from here so
 * cross-module wiring stays on the module barrel rather than reaching
 * into `./presentation/actions/*` directly.
 */
export { ChatWorkspace } from "./presentation/components/ChatWorkspace";
export type { ChatWorkspaceProps } from "./presentation/components/ChatWorkspace";
export { startOrLoadConversationAction } from "./presentation/actions/start-or-load-conversation.action";
export type { StartOrLoadConversationResult } from "./presentation/actions/start-or-load-conversation.action";
