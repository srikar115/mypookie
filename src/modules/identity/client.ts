/**
 * Public API for the `identity` module — client-safe surface.
 *
 * Import from this file when the consumer is (or transitively renders) a
 * client component: `PublicShell`, `PublicTopbar`, etc. Server actions are
 * safe to re-export here because Next.js compiles them into RPC proxies.
 */

export { AuthDialog, type AuthTab } from "./presentation/components/AuthDialog";
export { UserMenu, type SessionUser } from "./presentation/components/UserMenu";
export { logoutAction } from "./presentation/actions/logout.action";
