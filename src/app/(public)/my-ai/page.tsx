import { redirect } from "next/navigation";
import { getServerContext } from "@/composition/server-context";
import { createCharacterReadRepository } from "@/modules/characters";
import { MyAiGrid } from "@/modules/characters/client";

/**
 * /my-ai — the current user's companion gallery.
 *
 * Server-fetches the actor's characters and hands them to the client
 * `MyAiGrid`. Each tile links into /chat with the companion pre-selected.
 * The very first tile is always the "Create new AI" CTA, so the page
 * doubles as an empty-state and a browsing surface.
 *
 * Auth is gated in `layout.tsx`, so under normal conditions `ctx.actor` is
 * guaranteed to be present here. We keep a soft fallback (redirect) instead
 * of throwing, because during transient auth failures (e.g. NextAuth v5
 * UntrustedHost, an expired session between layout and page render) the
 * previous `throw` produced 500 pages instead of gracefully sending the
 * user back to the login flow.
 */

export const dynamic = "force-dynamic";

export default async function MyAiPage() {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    redirect("/?login=1");
  }

  const repo = createCharacterReadRepository(ctx);
  const characters = await repo.listByOwner(ctx.actor.id);

  return <MyAiGrid characters={characters} />;
}
