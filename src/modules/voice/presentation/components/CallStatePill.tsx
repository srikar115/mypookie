"use client";

import { cn } from "@/shared/presentation/utils";
import type { CallState } from "../hooks/useVoiceCall";

interface Props {
  readonly state: CallState;
  readonly characterName: string;
}

/**
 * The pulsing status pill in the top-center of the call overlay. Users
 * perceive this AS the responsiveness of the call — even a fast pipeline
 * feels laggy if the pill doesn't flip promptly.
 */
export function CallStatePill({ state, characterName }: Props) {
  const label = pillLabel(state, characterName);
  const dotClass = pillDot(state);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
      <span className={cn("h-2 w-2 rounded-full", dotClass)} />
      <span>{label}</span>
    </div>
  );
}

function pillLabel(state: CallState, name: string): string {
  switch (state) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting…";
    case "ringing":
      return `Ringing ${name}…`;
    case "listening":
      return "Live";
    case "user_speaking":
      return `${name} is listening`;
    case "character_thinking":
      return `${name} is thinking…`;
    case "character_speaking":
      return `${name} is speaking`;
    case "ended":
      return "Call ended";
    case "error":
      return "Call failed";
  }
}

function pillDot(state: CallState): string {
  switch (state) {
    case "idle":
    case "ended":
      return "bg-white/30";
    case "connecting":
    case "character_thinking":
      return "bg-amber-400 animate-pulse";
    case "ringing":
      return "bg-fuchsia-400 animate-pulse";
    case "listening":
      return "bg-emerald-400";
    case "user_speaking":
      return "bg-sky-400 animate-pulse";
    case "character_speaking":
      return "bg-pink-400 animate-pulse";
    case "error":
      return "bg-red-500";
  }
}
