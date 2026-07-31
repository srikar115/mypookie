"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CallState } from "../hooks/useVoiceCall";
import { CallStatePill } from "./CallStatePill";

interface Props {
  readonly characterName: string;
  readonly characterImageUrl?: string | null;
  readonly state: CallState;
  readonly error: string | null;
  readonly durationSec: number;
  readonly muted: boolean;
  readonly onHangUp: () => void | Promise<void>;
  readonly onToggleMute: () => void;
}

/**
 * Full-screen call overlay. Rendered into a portal so it sits above the
 * chat layout without inheriting its z-index stack.
 *
 * Layout mirrors Candy AI's call screen: character portrait dominates,
 * status pill at the top, controls at the bottom. Duration meter runs
 * under the character name.
 *
 * Remote audio playback is NOT owned by this component — {@link useVoiceCall}
 * calls `RemoteAudioTrack.attach()` on each subscribed track and appends
 * the returned `<audio>` element to `<body>` hidden. Necessary because
 * livekit-client does not auto-play remote tracks; without an attached
 * element you get silence.
 */
export function CallOverlay({
  characterName,
  characterImageUrl,
  state,
  error,
  durationSec,
  muted,
  onHangUp,
  onToggleMute,
}: Props) {
  // Prevent background scroll while the overlay is up.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="relative flex h-full w-full max-w-md flex-col items-center justify-between py-8">
        <div className="pt-4">
          <CallStatePill state={state} characterName={characterName} />
        </div>

        <div className="flex flex-col items-center gap-4">
          <CharacterPortrait
            name={characterName}
            imageUrl={characterImageUrl ?? null}
            speaking={state === "character_speaking"}
            ringing={state === "ringing"}
          />
          <div className="text-center">
            <div className="text-xl font-semibold text-white">
              {characterName}
            </div>
            <div className="mt-1 text-sm tabular-nums text-white/60">
              {formatDuration(durationSec)}
            </div>
          </div>
          {error ? (
            <div className="mx-4 max-w-xs rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-6 pb-6">
          <CircleButton
            label={muted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
            variant={muted ? "muted" : "neutral"}
            disabled={state === "ended" || state === "error"}
          >
            {muted ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </CircleButton>
          <CircleButton
            label="Hang up"
            onClick={onHangUp}
            variant="danger"
          >
            <PhoneOff className="h-6 w-6" />
          </CircleButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CharacterPortrait({
  name,
  imageUrl,
  speaking,
  ringing,
}: {
  name: string;
  imageUrl: string | null;
  speaking: boolean;
  ringing: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={cn(
          "relative h-48 w-48 overflow-hidden rounded-full border-4 border-white/10 shadow-2xl transition-shadow duration-300",
          speaking && "shadow-pink-500/30",
          ringing && "shadow-fuchsia-500/40",
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-500 to-purple-700 text-6xl font-semibold text-white">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
      </div>
      {speaking ? (
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-pink-400/60 animate-pulse" />
      ) : null}
      {ringing ? (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-fuchsia-400/60 animate-ping" />
          <div className="pointer-events-none absolute -inset-2 rounded-full border border-fuchsia-400/30 animate-pulse" />
        </>
      ) : null}
    </div>
  );
}

function CircleButton({
  children,
  label,
  onClick,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  variant: "neutral" | "muted" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={() => void onClick()}
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition-all",
        variant === "neutral" &&
          "bg-white/10 hover:bg-white/20 active:scale-95",
        variant === "muted" &&
          "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 active:scale-95",
        variant === "danger" &&
          "bg-red-500 hover:bg-red-600 active:scale-95 shadow-lg shadow-red-500/30",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
