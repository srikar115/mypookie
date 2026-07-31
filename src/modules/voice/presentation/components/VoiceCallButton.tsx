"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CallState } from "../hooks/useVoiceCall";
import { CallOverlay } from "./CallOverlay";

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
  readonly characterName: string;
  readonly characterImageUrl?: string | null;
  /**
   * When false (default while the beta flag is off), the button renders
   * as a disabled placeholder with the classic "coming soon" tooltip.
   * The parent layout controls this via the public
   * `NEXT_PUBLIC_VOICE_CALLS_ENABLED` flag so we don't leak server-only
   * env into the client bundle.
   */
  readonly enabled: boolean;
  /**
   * Lifted call handle. The parent that owns `useVoiceCall` passes it
   * in so it can also observe state transitions (e.g. refresh the chat
   * transcript on hang-up) and drive programmatic re-starts (the
   * "Speak again" affordance).
   */
  readonly call: VoiceCallHandle;
  /**
   * When the parent is driving the overlay lifecycle (Speak Again),
   * it can force the overlay open by passing `openSignal` as a counter
   * that ticks upward. The button also opens the overlay on its own
   * click; this prop is purely additive.
   */
  readonly openSignal?: number;
}

/**
 * VoiceCallButton — the phone icon in ConversationHeader. Renders the
 * button and owns the CallOverlay portal's open/close visibility, but
 * delegates the underlying voice-call state to the `call` handle passed
 * in from the parent.
 *
 * Rationale for state-lifting: ChatConversation needs to know when the
 * call transitions to `ended` (to refresh the transcript), and it needs
 * an imperative way to re-start a call (for the "Speak again" pill in
 * the CallEndedMarker). Both are trivial with the handle in scope.
 */
export function VoiceCallButton({
  conversationId,
  characterName,
  characterImageUrl,
  enabled,
  call,
  openSignal,
}: Props) {
  const [open, setOpen] = useState(false);
  const { state, error, durationSec, muted, start, hangUp, toggleMute } = call;

  const disabled = !enabled || !conversationId || open;

  // Auto-close on final state after showing the "ended" / "error" text.
  useEffect(() => {
    if (!open) return;
    if (state === "ended" || state === "error") {
      const t = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(t);
    }
  }, [open, state]);

  // Parent-initiated open (Speak again). We open on tick and let the
  // internal start-effect below run one tick later.
  const [lastOpenSignal, setLastOpenSignal] = useState(openSignal ?? 0);
  useEffect(() => {
    if (openSignal === undefined) return;
    if (openSignal !== lastOpenSignal) {
      setLastOpenSignal(openSignal);
      if (!conversationId) return;
      setOpen(true);
      void start(conversationId);
    }
  }, [openSignal, lastOpenSignal, conversationId, start]);

  const handleClick = () => {
    if (disabled || !conversationId) return;
    setOpen(true);
    void start(conversationId);
  };

  const handleHangUp = async () => {
    await hangUp();
  };

  const title = !enabled
    ? "Voice call (coming soon)"
    : !conversationId
      ? "Loading…"
      : "Start voice call";

  return (
    <>
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
      {open ? (
        <CallOverlay
          characterName={characterName}
          characterImageUrl={characterImageUrl}
          state={state}
          error={error}
          durationSec={durationSec}
          muted={muted}
          onHangUp={handleHangUp}
          onToggleMute={toggleMute}
        />
      ) : null}
    </>
  );
}
