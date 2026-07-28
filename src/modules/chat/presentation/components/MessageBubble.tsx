"use client";

import { cn } from "@/shared/presentation/utils";
import { formatClock } from "./format";

/**
 * Role literal matches the DB enum values ('user' | 'assistant' | 'system').
 * SYSTEM messages are never rendered — the streaming route filters them out
 * on read, but keep the value in the union so future admin/whisper events
 * don't require a type change.
 */
export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly text: string;
  readonly at: Date;
  /**
   * When true, this is a placeholder assistant bubble waiting on tokens.
   * The bubble renders a tiny animated cursor instead of an empty pill.
   */
  readonly streaming?: boolean;
  /**
   * Non-null when the row was marked FAILED. Rendered as inline error text.
   */
  readonly errorMessage?: string | null;
}

interface Props {
  readonly message: ChatMessage;
}

/**
 * A single message bubble. Assistant messages sit left-aligned in a dark
 * neutral pill; the user's messages sit right-aligned in a pink accent so
 * the eye can scan authorship at a glance (candy.ai's convention).
 */
export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const hasError =
    message.errorMessage !== null &&
    message.errorMessage !== undefined &&
    message.errorMessage.length > 0;

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
          hasError && "ring-1 ring-red-500/50",
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.text}
          {message.streaming ? (
            <span className="ml-0.5 inline-block h-3 w-1 translate-y-0.5 animate-pulse bg-white/70" />
          ) : null}
        </p>
        {hasError ? (
          <p className="mt-1 text-[11px] text-red-300">
            Failed to reply — {message.errorMessage}
          </p>
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
