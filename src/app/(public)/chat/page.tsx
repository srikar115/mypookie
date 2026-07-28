import { getServerContext } from "@/composition/server-context";
import { createCharacterReadRepository } from "@/modules/characters";
import {
  createListMessagesUseCase,
  createStartOrLoadConversationUseCase,
} from "@/modules/chat";
import { ChatWorkspace } from "@/modules/chat/client";

/**
 * /chat — candy.ai-style messaging workspace.
 *
 * Server-fetches the current user's characters (both drafts and active
 * companions) and hands them to the client `ChatWorkspace`. When a
 * companion is deep-linked via `?with=<id>` (from the /my-ai gallery), the
 * page also server-loads that conversation + last 50 messages so the first
 * paint contains the full thread without a client round trip.
 *
 * `force-dynamic` because the sidebar list is per-user; caching it would
 * leak one user's companions into another user's shell.
 */

export const dynamic = "force-dynamic";

interface ChatPageProps {
  searchParams: Promise<{ with?: string | string[] }>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    throw new Error("Unreachable: /chat rendered without an actor.");
  }

  const repo = createCharacterReadRepository(ctx);
  const characters = await repo.listByOwner(ctx.actor.id);

  const raw = (await searchParams).with;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const initialSelectedId =
    requested && characters.some((c) => c.id === requested)
      ? requested
      : null;

  let initialConversationId: string | null = null;
  let initialMessages:
    | Awaited<ReturnType<ReturnType<typeof createListMessagesUseCase>["execute"]>>
    | null = null;
  if (initialSelectedId) {
    // Pre-warm the deep-linked thread on the server so tokens can arrive on
    // the very first client render. Failures (e.g. the companion was just
    // deleted) fall through silently — the workspace will lazy-load.
    try {
      const startOrLoad = createStartOrLoadConversationUseCase(ctx);
      const conversation = await startOrLoad.execute({
        actorUserId: ctx.actor.id,
        characterId: initialSelectedId,
      });
      const listMessages = createListMessagesUseCase(ctx);
      const messages = await listMessages.execute({
        actorUserId: ctx.actor.id,
        conversationId: conversation.id,
        limit: 50,
      });
      initialConversationId = conversation.id;
      initialMessages = messages;
    } catch (e) {
      console.warn("[chat.page] failed to pre-hydrate thread", e);
    }
  }

  return (
    <ChatWorkspace
      characters={characters}
      initialSelectedId={initialSelectedId}
      initialConversationId={initialConversationId}
      initialMessages={initialMessages ?? undefined}
    />
  );
}
