import { notFound, redirect } from "next/navigation";
import { getServerContext } from "@/composition/server-context";
import { createCharacterReadRepository } from "@/modules/characters";
import {
  createConversationRepository,
  createListMessagesUseCase,
  createStartOrLoadConversationUseCase,
} from "@/modules/chat";
import { ChatWorkspace } from "@/modules/chat/client";
import { slugifyName } from "@/shared/presentation/utils";

/**
 * `/ai-girlfriend/[slug]?conversation_id=<uuid>` — canonical Candy.ai-style
 * URL for a specific chat thread.
 *
 * Selection contract:
 * - Truth-source is the `conversation_id` query param. The [slug] path
 *   segment is decorative for SEO and shareability — we redirect to the
 *   canonical slug (derived from the character's name) whenever it drifts
 *   so links stay clean but old bookmarks never 404.
 * - Ownership is enforced against the current actor. Anonymous visitors
 *   are already redirected by the sibling `layout.tsx`; here we defend
 *   against session-vs-conversation mismatches (e.g. sharing a link).
 * - Server-hydrates the last 50 messages so the first paint contains
 *   the full thread — same treatment as `/chat?with=<id>`.
 *
 * Falls back to `/chat` when the query param is missing so the sidebar's
 * "Chat" tab still lands somewhere sane.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ conversation_id?: string | string[] }>;
}

export default async function AiGirlfriendPage({
  params,
  searchParams,
}: PageProps) {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    throw new Error("Unreachable: /ai-girlfriend rendered without an actor.");
  }

  const { slug } = await params;
  const rawId = (await searchParams).conversation_id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;

  // Missing conversation_id: send to the chat landing so the user can
  // pick a companion from their sidebar.
  if (!conversationId) {
    redirect("/chat");
  }

  // Race the two independent lookups. The conversation load and the
  // owner's characters list have no data dependency — running them in
  // parallel saves one full DB round-trip on every page load.
  //
  // Trade-off: on the (rare) 404 branch we do fetch characters that
  // we then discard. That's one wasted SELECT vs 300ms saved on the
  // 200 branch — the common case wins by a large margin.
  const convoRepo = createConversationRepository(ctx);
  const charRepo = createCharacterReadRepository(ctx);
  const [conversation, characters] = await Promise.all([
    convoRepo.findById(conversationId),
    charRepo.listByOwner(ctx.actor.id),
  ]);
  if (!conversation || conversation.userId !== ctx.actor.id) {
    // Unknown or not-yours — hide existence entirely.
    notFound();
  }
  const character = characters.find((c) => c.id === conversation.characterId);
  if (!character) notFound();

  // Redirect drifted slugs (e.g. renamed character, hand-typed URL) to
  // the canonical one. `replace` semantics: the browser back button
  // still gets the user back to wherever they came from, not to the
  // bad URL. Kept as a full redirect so shared/pasted links normalize.
  const canonicalSlug = slugifyName(character.name);
  if (slug !== canonicalSlug) {
    redirect(
      `/ai-girlfriend/${canonicalSlug}?conversation_id=${conversation.id}`,
    );
  }

  // Pre-warm the deep-linked thread the same way /chat does.
  //
  // `startOrLoad` is belt-and-braces defense (ownership + presence
  // re-check via the use case, idempotent) — its return value is not
  // used because we already have `conversation.id` from the findById
  // above. So we can race it against `listMessages` and cut one full
  // DB round-trip off every hot page load.
  let initialMessages:
    | Awaited<ReturnType<ReturnType<typeof createListMessagesUseCase>["execute"]>>
    | null = null;
  try {
    const startOrLoad = createStartOrLoadConversationUseCase(ctx);
    const listMessages = createListMessagesUseCase(ctx);
    const [, messages] = await Promise.all([
      startOrLoad.execute({
        actorUserId: ctx.actor.id,
        characterId: character.id,
      }),
      listMessages.execute({
        actorUserId: ctx.actor.id,
        conversationId: conversation.id,
        limit: 50,
      }),
    ]);
    initialMessages = messages;
  } catch (e) {
    console.warn("[ai-girlfriend.page] failed to pre-hydrate thread", e);
  }

  return (
    <ChatWorkspace
      characters={characters}
      initialSelectedId={character.id}
      initialConversationId={conversation.id}
      initialMessages={initialMessages ?? undefined}
    />
  );
}
