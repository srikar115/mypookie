"use client";

import { Phone, PhoneOff } from "lucide-react";

interface Props {
  readonly durationSec: number;
  readonly at: Date;
  /**
   * Called when the user taps "Speak again" in this marker. Undefined
   * disables the button — useful when the workspace can't currently
   * start a new call (offline, voice feature flag off, etc.).
   */
  readonly onSpeakAgain?: () => void;
}

/**
 * The "Live Phone Call ended" chip that closes out a voice session in
 * the transcript. Mirrors the Candy AI treatment: right-aligned block
 * (spoken initiative was the user's), warm gradient chip on top, and a
 * green "Speak again" pill directly below.
 *
 * Deliberately not a `MessageBubble` — this row is UI chrome, not part
 * of the conversation itself. The distinct visual keeps it from
 * competing with real spoken lines in the reader's attention.
 */
export function CallEndedMarker({ durationSec, onSpeakAgain }: Props) {
  return (
    <div className="flex w-full flex-col items-end gap-2">
      <div className="inline-flex max-w-[75%] items-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm text-white shadow-lg shadow-fuchsia-500/20">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
          <PhoneOff className="h-3.5 w-3.5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-medium">Live Phone Call ended</span>
          <span className="text-xs text-white/80">
            {formatDuration(durationSec)}
          </span>
        </div>
      </div>
      {onSpeakAgain ? (
        <button
          type="button"
          onClick={onSpeakAgain}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-600 active:scale-[0.98]"
        >
          <Phone className="h-4 w-4" />
          Speak again
        </button>
      ) : null}
    </div>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}
