"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CallState } from "../hooks/useVoiceCall";

/**
 * Handle exposed by {@link useVoiceCall}. Kept as a discrete interface so
 * the parent can either lift it up (ChatConversation) or leave it
 * self-contained on the button (legacy pages that render the button
 * without a workspace shell).
 */
export interface VoiceCallHandle {
  readonly state: CallState;
  readonly error: string | null;
  readonly durationSec: number;
  readonly muted: boolean;
  readonly start: (conversationId: string) => Promise<void>;
  readonly hangUp: () => Promise<void>;
  readonly toggleMute: () => void;
}

interface Props {
  readonly conversationId: string | null;
  readonly enabled: boolean;
  /**
   * Lifted call handle. The parent that owns `useVoiceCall` passes it
   * in so it can also observe state transitions (e.g. refresh the chat
   * transcript on hang-up) and drive programmatic re-starts (the
   * "Speak again" affordance).
   */
  readonly call: VoiceCallHandle;
  /**
   * When the parent is driving the call lifecycle (Speak Again), it
   * can trigger a fresh call by ticking this counter upward. The
   * button also starts on its own click; this prop is purely additive.
   */
  readonly openSignal?: number;
}

/**
 * VoiceCallButton — the phone icon in ConversationHeader. Fires
 * `call.start(conversationId)` on click and lets the CallBar (rendered
 * by ChatConversation above the message feed) drive the rest of the
 * call UI. No portal, no overlay ownership.
 */
export function VoiceCallButton({
  conversationId,
  enabled,
  call,
  openSignal,
}: Props) {
  const { state, start } = call;
  const inCall = state !== "idle" && state !== "ended" && state !== "error";
  const disabled = !enabled || !conversationId || inCall;

  // Parent-initiated start (Speak Again). We start on tick.
  const [lastOpenSignal, setLastOpenSignal] = useState(openSignal ?? 0);
  useEffect(() => {
    if (openSignal === undefined) return;
    if (openSignal !== lastOpenSignal) {
      setLastOpenSignal(openSignal);
      if (!conversationId) return;
      void start(conversationId);
    }
  }, [openSignal, lastOpenSignal, conversationId, start]);

  const handleClick = () => {
    if (disabled || !conversationId) return;
    void start(conversationId);
  };

  const title = !enabled
    ? "Voice call (coming soon)"
    : inCall
      ? "Call in progress"
      : !conversationId
        ? "Loading…"
        : "Start voice call";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        disabled
          ? "text-[#4a4a55] cursor-not-allowed"
          : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white",
      )}
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
