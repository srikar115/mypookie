"use client";

import Link from "next/link";
import { Search, Plus, User as UserIcon } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CharacterSummaryDto } from "@/modules/characters";
import { formatSidebarStamp } from "./format";
import { greetingFor } from "./greeting";

export interface ThreadPreview {
  readonly lastText: string;
  readonly lastAt: Date;
}

interface Props {
  readonly characters: readonly CharacterSummaryDto[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly threadPreviews: Record<string, ThreadPreview>;
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
}

/**
 * Left column of the chat workspace — the conversation list. Each row is
 * a character the current user has created. When there are no matching
 * characters the sidebar shows a soft empty state that points at /create.
 *
 * `threadPreviews` is a client-derived map from character id to that
 * thread's last-message text and timestamp so the sidebar can render
 * candy.ai-style previews without a network round trip.
 */
export function ChatSidebar({
  characters,
  selectedId,
  onSelect,
  threadPreviews,
  query,
  onQueryChange,
}: Props) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? characters.filter((c) => c.name.toLowerCase().includes(q))
    : characters;

  return (
    <aside className="w-full sm:w-72 md:w-80 lg:w-[22rem] shrink-0 flex flex-col border-r border-[#1e1e26] bg-[#0d0d13]">
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <h2 className="text-2xl font-semibold text-white">Chat</h2>
        <button
          type="button"
          disabled
          title="Group chats coming soon"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a34] bg-[#131318] px-3 py-1.5 text-xs font-medium text-[#c4c2d4] opacity-70 cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          New Group
        </button>
      </header>

      <div className="px-4 pb-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b6b76]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search for a profile..."
            className="w-full h-10 pl-9 pr-3 rounded-full bg-[#131318] border border-[#2a2a34] text-white text-sm placeholder:text-[#6b6b76] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 transition-colors"
          />
        </label>
      </div>

      <ul className="flex-1 overflow-y-auto pb-4">
        {filtered.length === 0 ? (
          <EmptyState hasQuery={q.length > 0} totalCount={characters.length} />
        ) : (
          filtered.map((c) => {
            const preview = threadPreviews[c.id];
            const previewText = preview?.lastText ?? greetingFor(c);
            const previewAt = preview?.lastAt ?? new Date(c.createdAt);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                    selectedId === c.id
                      ? "bg-[#1a1a22]"
                      : "hover:bg-[#151519]",
                  )}
                >
                  <Avatar name={c.name} imageUrl={c.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {c.name}
                      </span>
                      <span className="text-[11px] text-[#6b6b76] shrink-0">
                        {formatSidebarStamp(previewAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#8a8a99]">
                      {previewText}
                    </p>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

function EmptyState({
  hasQuery,
  totalCount,
}: {
  hasQuery: boolean;
  totalCount: number;
}) {
  if (hasQuery && totalCount > 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-[#8a8a99]">
        No conversations match your search.
      </div>
    );
  }
  return (
    <div className="px-4 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a22] text-[#8a8a99]">
        <UserIcon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-white">No companions yet</p>
      <p className="mt-1 text-xs text-[#8a8a99]">
        Create your first AI companion to start chatting.
      </p>
      <Link
        href="/create"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Create Character
      </Link>
    </div>
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#2a2a34]">
        {/* Sticking with a raw <img> to avoid a next/image remotePatterns config for the R2 bucket. Matches the pattern used in PreviewScreen. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-semibold text-white">
      {initial}
    </div>
  );
}
