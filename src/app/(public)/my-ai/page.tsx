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
 */

export const dynamic = "force-dynamic";

export default async function MyAiPage() {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    throw new Error("Unreachable: /my-ai rendered without an actor.");
  }

  const repo = createCharacterReadRepository(ctx);
  const characters = await repo.listByOwner(ctx.actor.id);

  return <MyAiGrid characters={characters} />;
}
