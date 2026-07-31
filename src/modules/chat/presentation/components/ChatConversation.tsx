"use client";

import { useEffect, useRef, useState } from "react";
import {
  Gift,
  MoreHorizontal,
  PanelRightOpen,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CharacterSummaryDto } from "@/modules/characters";
import { VoiceCallButton, useVoiceCall } from "@/modules/voice/client";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { CallEndedMarker } from "./CallEndedMarker";
import { TypingIndicator } from "./TypingIndicator";
import { useChatStream } from "../hooks/useChatStream";

// Public feature flag so the client can hide the phone button entirely
// until voice calls are launched globally. NEXT_PUBLIC_* is inlined by
// Next.js at build time.
const VOICE_CALLS_ENABLED =
  process.env.NEXT_PUBLIC_VOICE_CALLS_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_VOICE_CALLS_ENABLED === "1";

interface Props {
  readonly character: CharacterSummaryDto;
  readonly conversationId: string | null;
  readonly initialMessages: readonly ChatMessage[];
  readonly onToggleDetail: () => void;
  readonly detailOpen: boolean;
  /**
   * Called whenever the local message array grows so the workspace can
   * show a fresh preview line in the sidebar. Optional — the sidebar
   * happily falls back to the character's tagline greeting.
   */
  readonly onLastMessageChange?: (msg: ChatMessage) => void;
}

/**
 * Center column — the active conversation. Header, scrollable message
 * feed, and composer. Owns the streaming lifecycle via `useChatStream`;
 * the workspace only tells it which conversationId is active and what to
 * hydrate from.
 */
export function ChatConversation({
  character,
  conversationId,
  initialMessages,
  onToggleDetail,
  detailOpen,
  onLastMessageChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { messages, streaming, reading, send, retry, initiateOpener, refresh } =
    useChatStream({
      conversationId,
      initialMessages,
    });

  // ─── Voice call plumbing ──────────────────────────────────────
  // Hoisted here (rather than inside VoiceCallButton) for two reasons:
  //   1. When the call ends we need to refresh the transcript so the
  //      voice turns persisted by the agent worker (and the boundary
  //      marker persisted by EndCallUseCase) flow into the message list.
  //   2. The CallEndedMarker's "Speak again" button re-starts the same
  //      call, which is easiest to model as a signal counter that the
  //      button watches.
  const call = useVoiceCall();
  const [speakAgainSignal, setSpeakAgainSignal] = useState(0);
  const prevCallStateRef = useRef(call.state);
  useEffect(() => {
    const prev = prevCallStateRef.current;
    prevCallStateRef.current = call.state;
    // Refresh once, on the falling edge into `ended`. `error` we skip —
    // if the call never connected, nothing new to render. Small delay
    // lets the LiveKit agent's final /voice-agent/turn POST land before
    // we re-fetch (the agent posts fire-and-forget so this is a race
    // we bias by ~700ms rather than solving with polling).
    if (prev !== "ended" && call.state === "ended") {
      const t = setTimeout(() => {
        void refresh();
      }, 700);
      return () => clearTimeout(t);
    }
  }, [call.state, refresh]);
  const handleSpeakAgain = () => {
    if (!conversationId) return;
    setSpeakAgainSignal((n) => n + 1);
  };

  // ─── Character-initiated opener ────────────────────────────────
  // When the chat view mounts (or the user switches to a fresh
  // conversation), the character speaks first if the user hasn't.
  // Two flavours:
  //
  //   Fresh thread (empty history)   → opener 2s after mount.
  //   Revisit with stale tail        → opener 2s after mount, only
  //                                    if the last assistant message
  //                                    is at least 5 minutes old.
  //
  // Suppressed when:
  //   - the composer already has a draft (user is typing)
  //   - a stream or reading beat is already in flight
  //   - we already fired one for this mount
  //   - the last message is from the user (they're expecting a reply
  //     from the previous send; auto-opener would ignore them)
  //
  // Idle threshold is intentionally short: Candy fires within about
  // 1-2s. Any longer and the empty chat feels awkward.
  const OPENER_IDLE_MS = 2000;
  const OPENER_STALE_ASSISTANT_MS = 5 * 60 * 1000;
  const openerFiredRef = useRef(false);
  useEffect(() => {
    if (!conversationId) return;
    if (openerFiredRef.current) return;
    if (streaming || reading) return;

    // Snapshot the eligibility state at effect-run time so the
    // timeout reads the latest values without triggering re-runs on
    // every message. React's stale-closure isn't a bug here — it's
    // the intended semantics.
    const last = messages[messages.length - 1];
    const eligible = (() => {
      if (!last) return true; // fresh empty thread
      if (last.role === "user") return false; // user is awaiting a reply
      if (last.role !== "assistant") return false; // system or other — bail
      const ageMs = Date.now() - last.at.getTime();
      return ageMs >= OPENER_STALE_ASSISTANT_MS;
    })();
    if (!eligible) return;

    const timer = setTimeout(() => {
      // Re-check just before firing — the user might have started
      // typing during the idle window.
      if (draft.trim().length > 0) return;
      if (streaming || reading) return;
      openerFiredRef.current = true;
      void initiateOpener();
    }, OPENER_IDLE_MS);

    return () => clearTimeout(timer);
    // messages.length is in the deps so the "was the thread empty?"
    // check re-runs once after initial hydration. `draft` is NOT in
    // deps — checking it inside the timeout is enough (adding it
    // would restart the timer on every keystroke, defeating the
    // "user is typing" cancellation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length, streaming, reading]);

  // Index of the tail failed-assistant bubble (if any). Only that
  // bubble gets an onRetry callback so older errors don't grow
  // duplicate buttons — a common bug when the transcript scrolls up.
  const tailFailedIndex = (() => {
    const last = messages[messages.length - 1];
    if (!last) return -1;
    if (last.role !== "assistant") return -1;
    if (!last.errorCode) return -1;
    return messages.length - 1;
  })();

  // Auto-scroll on new message, streaming delta, or when the reading
  // indicator flips on/off — anything that changes what's rendered at
  // the bottom of the feed.
  const tail = messages[messages.length - 1];
  const tailKey = `${messages.length}:${tail?.id ?? ""}:${tail?.text.length ?? 0}:${reading ? "r" : "-"}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tailKey]);

  useEffect(() => {
    if (tail && onLastMessageChange) onLastMessageChange(tail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setDraft("");
      void send(text);
    }
  };

  const disabled = !conversationId || streaming;
  const composerHelp = !conversationId
    ? "Loading conversation…"
    : reading
      ? `${character.name} is reading…`
      : streaming
        ? `${character.name} is typing…`
        : null;

  return (
    <section className="flex flex-1 flex-col min-w-0 bg-[#0a0a0f]">
      <ConversationHeader
        character={character}
        detailOpen={detailOpen}
        onToggleDetail={onToggleDetail}
        conversationId={conversationId}
        call={call}
        speakAgainSignal={speakAgainSignal}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
      >
        {messages.length === 0 && conversationId ? (
          <EmptyThread character={character} />
        ) : (
          <>
            {messages.map((m, i) => {
              // Call-boundary marker rows render as a distinct pill
              // (phone-off + duration + Speak again) rather than a
              // MessageBubble. Only the tail marker gets the button —
              // older markers stay as passive receipts so the
              // transcript doesn't sprout dozens of "Speak again"
              // affordances.
              if (m.kind === "call_ended") {
                const isTailMarker = i === messages.length - 1;
                return (
                  <CallEndedMarker
                    key={m.id}
                    durationSec={m.durationSec ?? 0}
                    at={m.at}
                    onSpeakAgain={
                      isTailMarker && conversationId
                        ? handleSpeakAgain
                        : undefined
                    }
                  />
                );
              }
              // Swap the empty streaming placeholder for a dedicated
              // "typing" pill. As soon as the first token arrives we
              // fall through to the normal bubble (which still shows a
              // subtle cursor via message.streaming), so the transition
              // is seamless.
              const isTailStreamingEmpty =
                i === messages.length - 1 &&
                m.role === "assistant" &&
                m.streaming === true &&
                m.text.length === 0;
              if (isTailStreamingEmpty) {
                return (
                  <TypingIndicator
                    key={m.id}
                    mode="typing"
                    characterName={character.name}
                    characterImageUrl={character.imageUrl}
                  />
                );
              }
              const isTailFailed = i === tailFailedIndex;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  characterName={character.name}
                  onRetry={isTailFailed ? () => void retry() : undefined}
                />
              );
            })}
            {/*
              Reading beat — the hook holds the assistant bubble out of
              the message list during this phase, so we render a
              distinct pill here rather than swap on tail contents.
              Anchored to a stable key so React doesn't rebuild the
              subtree when other state (streaming, tail text) changes.
            */}
            {reading ? (
              <TypingIndicator
                key="reading-indicator"
                mode="reading"
                characterName={character.name}
                characterImageUrl={character.imageUrl}
              />
            ) : null}
          </>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[#1e1e26] bg-[#0d0d13] px-4 md:px-6 py-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[#2a2a34] bg-[#131318] px-3 py-2 focus-within:border-pink-500/60 focus-within:ring-1 focus-within:ring-pink-500/30 transition-colors">
          <div className="flex items-center gap-1 pb-1 text-[#8a8a99]">
            <IconButton title="Send a gift (coming soon)" disabled>
              <Gift className="h-4 w-4" />
            </IconButton>
            <IconButton title="Chat settings (coming soon)" disabled>
              <SlidersHorizontal className="h-4 w-4" />
            </IconButton>
          </div>
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            disabled={disabled}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-white placeholder:text-[#6b6b76] outline-none max-h-32 disabled:opacity-70"
          />
          <button
            type="submit"
            disabled={disabled || draft.trim().length === 0}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              disabled || draft.trim().length === 0
                ? "bg-[#1a1a22] text-[#4a4a55] cursor-not-allowed"
                : "bg-pink-500 text-white hover:bg-pink-600",
            )}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {composerHelp ? (
          <p className="mt-2 px-1 text-[11px] text-[#6b6b76]">{composerHelp}</p>
        ) : null}
      </form>
    </section>
  );
}

function EmptyThread({ character }: { character: CharacterSummaryDto }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-[#8a8a99]">
      <p className="text-sm">
        Start your conversation with{" "}
        <span className="text-white font-medium">{character.name}</span>.
      </p>
      {character.tagline ? (
        <p className="mt-1 max-w-sm text-xs text-[#6b6b76]">
          &ldquo;{character.tagline}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

function ConversationHeader({
  character,
  detailOpen,
  onToggleDetail,
  conversationId,
  call,
  speakAgainSignal,
}: {
  character: CharacterSummaryDto;
  detailOpen: boolean;
  onToggleDetail: () => void;
  conversationId: string | null;
  call: ReturnType<typeof useVoiceCall>;
  speakAgainSignal: number;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[#1e1e26] px-4 md:px-6 py-3">
      <HeaderAvatar name={character.name} imageUrl={character.imageUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">
            {character.name}
          </span>
          <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-medium text-pink-400">
            {character.relationshipLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </div>
      </div>
      <div className="flex items-center gap-1 text-[#c4c2d4]">
        <VoiceCallButton
          conversationId={conversationId}
          characterName={character.name}
          characterImageUrl={character.imageUrl}
          enabled={VOICE_CALLS_ENABLED}
          call={call}
          openSignal={speakAgainSignal}
        />
        <IconButton title="More options">
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={onToggleDetail}
          title={detailOpen ? "Hide profile" : "Show profile"}
          className={cn(
            "hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors",
            detailOpen
              ? "bg-[#1a1a22] text-white"
              : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white",
          )}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function HeaderAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#2a2a34]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-xs font-semibold text-white">
      {initial}
    </div>
  );
}

function IconButton({
  children,
  title,
  disabled,
}: {
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        disabled
          ? "text-[#4a4a55] cursor-not-allowed"
          : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
