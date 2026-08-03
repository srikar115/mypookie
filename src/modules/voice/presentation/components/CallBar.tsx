"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CallState } from "../hooks/useVoiceCall";

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
 * CallBar — inline compact call surface, rendered above the chat feed
 * while a call is in progress. Replaces the full-screen CallOverlay
 * portal, matching the Candy-style horizontal strip: avatar + name +
 * animated status + timer + mic + hang-up.
 *
 * Non-blocking by design: the message transcript stays visible and
 * scrollable beneath the bar, so a user can reference prior context
 * while the call is live (which is how Candy AI ships it).
 *
 * Entrance / exit uses the design-system's snappy cubic-bezier so the
 * bar slides down from the header and lifts away cleanly on hang-up.
 */
export function CallBar({
  characterName,
  characterImageUrl,
  state,
  error,
  durationSec,
  muted,
  onHangUp,
  onToggleMute,
}: Props) {
  const speaking = state === "character_speaking";
  const ringing = state === "ringing";
  const isTerminal = state === "ended" || state === "error";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-b border-[#1e1e26] bg-[#0d0d13] px-4 md:px-6 py-2.5"
    >
      <div className="flex items-center gap-3">
        <CallAvatar
          name={characterName}
          imageUrl={characterImageUrl ?? null}
          speaking={speaking}
          ringing={ringing}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">
            {characterName}
          </div>
          <StatusLine state={state} characterName={characterName} error={error} />
        </div>

        <div
          className="tabular-nums text-xs text-[#c4c2d4] mr-1"
          aria-label="Call duration"
        >
          {formatDuration(durationSec)}
        </div>

        <CircleButton
          label={muted ? "Unmute mic" : "Mute mic"}
          onClick={onToggleMute}
          variant={muted ? "muted" : "neutral"}
          disabled={isTerminal}
        >
          {muted ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </CircleButton>
        <CircleButton
          label="Hang up"
          onClick={onHangUp}
          variant="danger"
          disabled={isTerminal}
        >
          <PhoneOff className="h-4 w-4" />
        </CircleButton>
      </div>
    </motion.div>
  );
}

/**
 * Renders the animated status line under the character name. The
 * three-dot equalizer is only shown for "live" states (ringing,
 * listening, speaking) — terminal / error states get a flat label.
 */
function StatusLine({
  state,
  characterName,
  error,
}: {
  state: CallState;
  characterName: string;
  error: string | null;
}) {
  const label = statusLabel(state, characterName, error);
  const colorClass = statusColor(state);
  const showEqualizer = shouldPulse(state);

  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
      {showEqualizer ? <Equalizer variant={equalizerVariant(state)} /> : null}
      <span className={cn("truncate", colorClass)}>{label}</span>
    </div>
  );
}

/** Three bouncing dots — the "…Listening" indicator from the screenshot. */
function Equalizer({ variant }: { variant: "purple" | "amber" | "rose" | "sky" }) {
  const dotColor = useMemo(() => {
    switch (variant) {
      case "amber":
        return "bg-amber-300";
      case "rose":
        return "bg-rose-400";
      case "sky":
        return "bg-sky-400";
      case "purple":
      default:
        return "bg-purple-300";
    }
  }, [variant]);

  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", dotColor)}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

function CallAvatar({
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
    <div className="relative shrink-0">
      <div
        className={cn(
          "relative h-10 w-10 overflow-hidden rounded-full border border-[#2a2a34] transition-shadow duration-300",
          speaking && "shadow-[0_0_0_2px_rgba(236,72,153,0.55)]",
          ringing && "shadow-[0_0_0_2px_rgba(217,70,239,0.55)]",
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
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-pink-500 to-purple-600 text-sm font-semibold text-white">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
      </div>
      {ringing ? (
        <span className="pointer-events-none absolute inset-0 rounded-full border border-fuchsia-400/60 animate-ping" />
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
        "inline-flex h-9 w-9 items-center justify-center rounded-full transition-all",
        variant === "neutral" &&
          "bg-[#1a1a22] text-[#c4c2d4] hover:bg-[#22222c] hover:text-white active:scale-95",
        variant === "muted" &&
          "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 active:scale-95",
        variant === "danger" &&
          "bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-[0_4px_16px_-4px_rgba(239,68,68,0.6)]",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

function statusLabel(
  state: CallState,
  characterName: string,
  error: string | null,
): string {
  if (state === "error") return error ?? "Call failed";
  switch (state) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting…";
    case "ringing":
      return `Ringing ${characterName}…`;
    case "listening":
      // Ambient "call is live, no one is speaking right now" state.
      // The previous label ("Listening") was read by users as "the
      // character is listening to me" — confusing when they're not
      // actually talking. "Live" mirrors Candy AI's convention and
      // removes the implication of active listening.
      return "Live";
    case "user_speaking":
      return `${characterName} is listening…`;
    case "character_thinking":
      return "Thinking…";
    case "character_speaking":
      return `${characterName} is speaking`;
    case "ended":
      return "Call ended";
    default:
      return "";
  }
}

function statusColor(state: CallState): string {
  switch (state) {
    case "connecting":
    case "character_thinking":
      return "text-amber-300";
    case "ringing":
      return "text-fuchsia-300";
    case "user_speaking":
      return "text-sky-300";
    case "character_speaking":
      return "text-rose-300";
    case "listening":
      return "text-purple-300";
    case "error":
      return "text-red-400";
    case "ended":
      return "text-white/50";
    default:
      return "text-white/60";
  }
}

function shouldPulse(state: CallState): boolean {
  return (
    state === "connecting" ||
    state === "ringing" ||
    state === "listening" ||
    state === "user_speaking" ||
    state === "character_thinking" ||
    state === "character_speaking"
  );
}

function equalizerVariant(state: CallState): "purple" | "amber" | "rose" | "sky" {
  switch (state) {
    case "connecting":
    case "character_thinking":
      return "amber";
    case "ringing":
    case "character_speaking":
      return "rose";
    case "user_speaking":
      return "sky";
    default:
      return "purple";
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString();
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Manages visibility of the CallBar based on the call state machine.
 * Wraps CallBar in an AnimatePresence so it slides in when the call
 * starts and slides out ~1200ms after entering a terminal state.
 *
 * Kept in the same file so `ChatConversation` renders a single element
 * and doesn't have to own the auto-dismiss timing.
 */
export function CallBarContainer(props: Props) {
  const { state } = props;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === "idle") {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (state === "ended" || state === "error") {
      // Hold the terminal label for a beat so the user reads it, then
      // slide out. Matches the previous overlay's dismissal timing.
      const t = setTimeout(() => setVisible(false), 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <AnimatePresence initial={false}>
      {visible ? <CallBar key="callbar" {...props} /> : null}
    </AnimatePresence>
  );
}
