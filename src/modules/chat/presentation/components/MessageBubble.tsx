"use client";

import { Phone, RotateCcw } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { formatClock } from "./format";
import {
  friendlyChatErrorMessage,
  isRetryableChatError,
  type ChatErrorCode,
} from "../lib/chat-error";
import { MessageText, TwemojiText } from "../lib/twemoji";

/**
 * Role literal matches the DB enum values ('user' | 'assistant' | 'system').
 * SYSTEM is used for call-boundary markers (see {@link ChatMessage.kind});
 * regular text SYSTEM rows aren't rendered.
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * `source` distinguishes typed turns from spoken turns. Voice-sourced
 * bubbles render a small phone glyph so the transcript reads like a
 * mixed text/voice conversation (Candy AI convention).
 */
export type MessageSource = "text" | "voice";

/**
 * Non-conversational rows we render as inline UI (call boundaries etc.).
 * A ChatMessage with `kind` set is treated by the renderer as a marker,
 * not a text bubble.
 */
export type ChatMessageKind = "call_ended";

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly text: string;
  readonly at: Date;
  readonly source?: MessageSource;
  /** Marker discriminator — when present, this row is rendered as a UI chrome pill, not a bubble. */
  readonly kind?: ChatMessageKind;
  /** Populated for `kind === "call_ended"` markers. */
  readonly durationSec?: number;
  /**
   * When true, this is a placeholder assistant bubble waiting on tokens.
   * The bubble renders a tiny animated cursor instead of an empty pill.
   */
  readonly streaming?: boolean;
  /**
   * Semantic error classification when the turn failed. Preferred over
   * `errorMessage`; drives the friendly copy + retry button.
   */
  readonly errorCode?: ChatErrorCode | null;
  /**
   * Free-form error text. Retained for backwards compat with older
   * server responses; new code paths set `errorCode` instead.
   */
  readonly errorMessage?: string | null;
  /**
   * Non-null when this assistant bubble is backed by a media generation.
   * MediaBubble is rendered instead of text content when set.
   */
  readonly mediaGenerationId?: string | null;
  /** Current media status — polled by useMediaGeneration. */
  readonly mediaStatus?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null;
  /** Public URL to the completed asset. */
  readonly mediaUrl?: string | null;
  readonly mediaKind?: "IMAGE" | "VIDEO" | null;
}

interface Props {
  readonly message: ChatMessage;
  /**
   * When provided AND the message has a retryable error, renders an
   * inline "Retry" chip that resends the last user prompt. Only the
   * ChatConversation should pass this — and only for the tail failed
   * bubble — so older errors don't grow duplicate buttons.
   */
  readonly onRetry?: () => void;
  /**
   * Character name folded into the friendly error copy so the message
   * feels addressed ("Tomato is getting a lot of messages…") rather
   * than systemic ("The provider returned 429").
   */
  readonly characterName?: string;
}

/**
 * A single message bubble. Assistant messages sit left-aligned in a dark
 * neutral pill; the user's messages sit right-aligned in a pink accent so
 * the eye can scan authorship at a glance (candy.ai's convention).
 *
 * Error rendering: the raw provider message is NEVER shown. Instead we
 * pick a friendly in-character line based on `errorCode` and (if
 * retryable + `onRetry` provided) render a subtle retry chip. This is
 * the paying-user-safe error UI — no HTTP codes leak.
 */
export function MessageBubble({ message, onRetry, characterName }: Props) {
  const isUser = message.role === "user";
  const isVoice = message.source === "voice";
  const hasError =
    (message.errorCode !== null && message.errorCode !== undefined) ||
    (message.errorMessage !== null &&
      message.errorMessage !== undefined &&
      message.errorMessage.length > 0);
  const showRetry =
    Boolean(onRetry) &&
    message.errorCode !== null &&
    message.errorCode !== undefined &&
    isRetryableChatError(message.errorCode);
  const errorCopy = hasError
    ? friendlyChatErrorMessage(
        message.errorCode ?? "UNKNOWN",
        characterName ?? "",
      )
    : null;

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-pink-500 text-white rounded-br-md"
            : "bg-[#1a1a22] text-white/95 rounded-bl-md",
        )}
      >
        {/* Voice-source label — inline phone glyph tells the user this
            bubble was spoken during a live call rather than typed. Placed
            above the text so the metadata reads naturally left-to-right. */}
        {isVoice ? (
          <div
            className={cn(
              "mb-1 inline-flex items-center gap-1 text-[11px] font-medium",
              isUser ? "text-white/80" : "text-pink-300/90",
            )}
          >
            <Phone className="h-3 w-3" />
            <span>Voice</span>
          </div>
        ) : null}
        {/* Text body — hidden entirely on error-only bubbles so we don't
            render an empty <p> above the friendly copy.
            Assistant bubbles run through `MessageText` (Candy-style
            purple italic on *action beats* + Twemoji swap on emojis).
            User bubbles use plain `TwemojiText` — users don't write
            asterisk RP actions, so highlighting them would be visually
            noisy and semantically wrong on the pink pill. */}
        {message.text.length > 0 || message.streaming ? (
          <p className="whitespace-pre-wrap break-words">
            {isUser ? (
              <TwemojiText text={message.text} />
            ) : (
              <MessageText text={message.text} />
            )}
            {message.streaming ? (
              <span className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-pulse bg-white/70" />
            ) : null}
          </p>
        ) : null}

        {errorCopy ? (
          <div
            className={cn(
              // Muted, not scary — a soft grey line that reads as
              // in-character explanation. No red banners, no HTTP codes.
              "flex flex-wrap items-center gap-2",
              message.text.length > 0 ? "mt-2" : "",
            )}
          >
            <span className="text-[12px] italic text-white/60">
              {errorCopy}
            </span>
            {showRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                  "bg-pink-500/15 text-pink-300 hover:bg-pink-500/25 hover:text-pink-200",
                  "transition-colors cursor-pointer",
                )}
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <span
          className={cn(
            "mt-1 block text-[10px]",
            isUser ? "text-white/70" : "text-[#8a8a99]",
          )}
        >
          {formatClock(message.at)}
        </span>
      </div>
    </div>
  );
}
