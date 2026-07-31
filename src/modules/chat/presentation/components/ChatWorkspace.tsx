"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { CharacterSummaryDto } from "@/modules/characters";
import { startOrLoadConversationAction } from "../actions/start-or-load-conversation.action";
import { listMessagesAction } from "../actions/list-messages.action";
import { ChatSidebar, type ThreadPreview } from "./ChatSidebar";
import { ChatConversation } from "./ChatConversation";
import { ChatDetail } from "./ChatDetail";
import type { ChatMessage } from "./MessageBubble";
import type { MessageDto } from "../../application/dto/message.dto";
import { dtoToChatMessage } from "../lib/dto-mapper";

export interface ChatWorkspaceProps {
  readonly characters: readonly CharacterSummaryDto[];
  /**
   * Optional companion id to focus on first render.
   */
  readonly initialSelectedId?: string | null;
  /**
   * When the page pre-loads a conversation for the selected companion, we
   * hydrate the sidebar with it so the first bubble paints without a
   * client-side round trip.
   */
  readonly initialConversationId?: string | null;
  readonly initialMessages?: readonly MessageDto[];
}

interface ThreadCache {
  readonly conversationId: string;
  readonly messages: readonly ChatMessage[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastMessage: ChatMessage | null;
}

/**
 * Client-side orchestrator for the /chat page. Owns:
 *   - which character/conversation is selected
 *   - the per-character thread cache (conversationId + hydrated messages)
 *   - the search query on the sidebar
 *   - whether the right-hand profile panel is open
 *
 * Threads are lazy-loaded from the server the first time a character is
 * selected, then cached in `threads[characterId]` for the rest of the
 * session. The active thread's message state lives inside
 * {@link ChatConversation}'s `useChatStream` — the workspace only feeds it
 * the initial rows and remounts it via `key={conversationId}` when the
 * user switches companions.
 */
export function ChatWorkspace({
  characters,
  initialSelectedId = null,
  initialConversationId = null,
  initialMessages,
}: ChatWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? characters[0]?.id ?? null,
  );
  const [threads, setThreads] = useState<Record<string, ThreadCache>>(() => {
    if (
      initialSelectedId &&
      initialConversationId &&
      Array.isArray(initialMessages)
    ) {
      const seeded = initialMessages.map(toChatMessage);
      return {
        [initialSelectedId]: {
          conversationId: initialConversationId,
          messages: seeded,
          loading: false,
          error: null,
          lastMessage: seeded[seeded.length - 1] ?? null,
        },
      };
    }
    return {};
  });
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(true);

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedId) ?? null,
    [characters, selectedId],
  );

  const activeThread: ThreadCache | null = selectedId
    ? threads[selectedId] ?? null
    : null;

  const loadThread = useCallback(
    async (characterId: string) => {
      setThreads((prev) => ({
        ...prev,
        [characterId]: {
          conversationId: prev[characterId]?.conversationId ?? "",
          messages: prev[characterId]?.messages ?? [],
          loading: true,
          error: null,
          lastMessage: prev[characterId]?.lastMessage ?? null,
        },
      }));

      const convResult = await startOrLoadConversationAction({ characterId });
      if (!convResult.ok) {
        setThreads((prev) => ({
          ...prev,
          [characterId]: {
            conversationId: "",
            messages: [],
            loading: false,
            error: convResult.error,
            lastMessage: null,
          },
        }));
        return;
      }

      const listResult = await listMessagesAction({
        conversationId: convResult.conversation.id,
        limit: 50,
      });
      if (!listResult.ok) {
        setThreads((prev) => ({
          ...prev,
          [characterId]: {
            conversationId: convResult.conversation.id,
            messages: [],
            loading: false,
            error: listResult.error,
            lastMessage: null,
          },
        }));
        return;
      }

      const chatMessages = listResult.messages.map(toChatMessage);
      setThreads((prev) => ({
        ...prev,
        [characterId]: {
          conversationId: convResult.conversation.id,
          messages: chatMessages,
          loading: false,
          error: null,
          lastMessage: chatMessages[chatMessages.length - 1] ?? null,
        },
      }));
    },
    [],
  );

  // Lazy-load whenever a fresh character is selected. `loadThread` sets
  // state on entry, so we defer through a microtask to keep the effect
  // body free of synchronous setState (see the set-state-in-effect rule).
  useEffect(() => {
    if (!selectedId) return;
    const existing = threads[selectedId];
    if (existing && existing.conversationId) return;
    if (existing?.loading) return;
    const id = selectedId;
    void Promise.resolve().then(() => loadThread(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleLastMessageChange = useCallback(
    (msg: ChatMessage) => {
      if (!selectedId) return;
      setThreads((prev) => {
        const t = prev[selectedId];
        if (!t) return prev;
        return { ...prev, [selectedId]: { ...t, lastMessage: msg } };
      });
    },
    [selectedId],
  );

  const threadPreviews = useMemo<Record<string, ThreadPreview>>(() => {
    const out: Record<string, ThreadPreview> = {};
    for (const c of characters) {
      const t = threads[c.id];
      if (t?.lastMessage) {
        out[c.id] = {
          lastText:
            t.lastMessage.role === "user"
              ? `You: ${t.lastMessage.text}`
              : t.lastMessage.text,
          lastAt: t.lastMessage.at,
        };
      }
    }
    return out;
  }, [characters, threads]);

  if (characters.length === 0) {
    return <EmptyWorkspace />;
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#0a0a0f]">
      <ChatSidebar
        characters={characters}
        selectedId={selectedId}
        onSelect={setSelectedId}
        threadPreviews={threadPreviews}
        query={query}
        onQueryChange={setQuery}
      />

      {selectedCharacter ? (
        <>
          <ChatConversation
            key={activeThread?.conversationId ?? `pending-${selectedCharacter.id}`}
            character={selectedCharacter}
            conversationId={activeThread?.conversationId || null}
            initialMessages={activeThread?.messages ?? []}
            onToggleDetail={() => setDetailOpen((v) => !v)}
            detailOpen={detailOpen}
            onLastMessageChange={handleLastMessageChange}
          />
          {detailOpen ? <ChatDetail character={selectedCharacter} /> : null}
        </>
      ) : (
        <NoSelection />
      )}
    </div>
  );
}

const toChatMessage = dtoToChatMessage;

function EmptyWorkspace() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center bg-[#0a0a0f] px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/30 to-purple-600/30 text-pink-300">
          <Plus className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-semibold text-white">
          You don&apos;t have any companions yet
        </h2>
        <p className="mt-2 text-sm text-[#c4c2d4]">
          Create your first AI companion and start a conversation. Every
          character you make appears here as a chat.
        </p>
        <Link
          href="/create"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-pink-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create your first character
        </Link>
      </div>
    </div>
  );
}

function NoSelection() {
  return (
    <section className="flex flex-1 items-center justify-center bg-[#0a0a0f] px-6 text-center">
      <p className="text-sm text-[#8a8a99]">
        Pick a companion on the left to start chatting.
      </p>
    </section>
  );
}
