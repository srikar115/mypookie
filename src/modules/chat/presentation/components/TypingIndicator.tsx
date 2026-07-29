"use client";

/**
 * TypingIndicator — assistant-side "presence" pill.
 *
 * Renders one of two states depending on `mode`:
 *
 * - `mode="reading"` — the beat between the user sending a message and
 *   the character starting to type. No dots (the character isn't doing
 *   anything visible yet); just the muted `<name> is reading…` line.
 *   Signals "she saw it" without over-selling activity.
 *
 * - `mode="typing"` — the character is actively composing. Pulsing
 *   pink dots + `<name> is typing`.
 *
 * Rendered by {@link ChatConversation}:
 *  - in `reading` mode while `useChatStream.reading === true` (the hook
 *    holds the assistant bubble out of the list during this window);
 *  - in `typing` mode when the tail message is a streaming assistant
 *    bubble that hasn't received a token yet.
 *
 * As soon as the first token arrives the workspace switches to the
 * regular {@link MessageBubble} (which shows a subtle cursor while
 * streaming continues) so the transition is smooth.
 */

export type TypingIndicatorMode = "reading" | "typing";

interface Props {
  readonly characterName: string;
  readonly characterImageUrl?: string | null;
  readonly mode?: TypingIndicatorMode;
}

export function TypingIndicator({
  characterName,
  characterImageUrl,
  mode = "typing",
}: Props) {
  const isReading = mode === "reading";
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-end gap-2 max-w-[75%]">
        <TypingAvatar name={characterName} imageUrl={characterImageUrl ?? null} />
        <div className="rounded-2xl rounded-bl-md bg-[#1a1a22] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-white/90">
              {characterName}
            </span>
            <span
              className={
                isReading
                  ? "text-[12px] italic text-white/45"
                  : "text-[12px] text-white/60"
              }
            >
              {isReading ? "is reading…" : "is typing"}
            </span>
            {isReading ? null : <TypingDots />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  // Staggered delays give the three dots a wave motion. Delays are
  // negative so the animation starts mid-cycle — no perceptible pause on
  // mount when the indicator flips on.
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-live="polite"
      aria-label="typing"
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-typing-dot"
        style={{ animationDelay: "-0.32s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-typing-dot"
        style={{ animationDelay: "-0.16s" }}
      />
      <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-typing-dot" />
    </span>
  );
}

function TypingAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-[#2a2a34]">
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
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-[11px] font-semibold text-white">
      {initial}
    </div>
  );
}
