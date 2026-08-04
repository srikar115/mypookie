"use client";

import type { MessageDto } from "../../application/dto/message.dto";
import { sanitizeAssistantReply } from "../../domain/sanitize-reply";
import type { ChatMessage } from "../components/MessageBubble";

/**
 * Regex must stay in sync with `formatCallEndedMarker` in
 * `end-call.use-case.ts`. Duplicated intentionally — importing the
 * server-only module here would drag `server-only` into the client
 * bundle.
 */
const CALL_ENDED_MARKER_RE = /^\[\[voice_call_ended:(\d+)\]\]$/;

/**
 * DTO → client ChatMessage. Owns the two mappings the UI needs:
 *
 *   1. DB role/source enums (UPPERCASE) → client union (lowercase).
 *   2. `role=SYSTEM + source=VOICE` sentinel content → `kind: "call_ended"`
 *      marker rows which are rendered by CallEndedMarker, not MessageBubble.
 *
 * Kept in `presentation/lib/` so both `ChatWorkspace` (initial hydration)
 * and `useChatStream` (post-call refresh) share one source of truth.
 */
export function dtoToChatMessage(m: MessageDto): ChatMessage {
  const role =
    m.role === "USER"
      ? "user"
      : m.role === "ASSISTANT"
        ? "assistant"
        : "system";
  const source: "text" | "voice" = m.source === "VOICE" ? "voice" : "text";

  if (m.role === "SYSTEM" && m.source === "VOICE") {
    const match = CALL_ENDED_MARKER_RE.exec(m.content.trim());
    if (match) {
      return {
        id: m.id,
        role: "system",
        source: "voice",
        kind: "call_ended",
        durationSec: Number.parseInt(match[1], 10),
        text: "",
        at: new Date(m.createdAt),
      };
    }
  }

  // Assistant rows may pre-date the server-side sanitizer (or carry
  // voice TTS markers that haven't been humanized yet). Scrub on
  // hydrate so legacy bubbles match the current text/voice style —
  // purple *action beats*, never raw `[voice call]` / `[Faint laugh]`.
  const text =
    role === "assistant" ? sanitizeAssistantReply(m.content) : m.content;

  return {
    id: m.id,
    role,
    source,
    text,
    at: new Date(m.createdAt),
    errorMessage: m.errorMessage,
    mediaGenerationId: m.mediaGenerationId ?? null,
    mediaStatus: m.mediaStatus ?? null,
    mediaUrl: m.mediaUrl ?? null,
    mediaKind: m.mediaKind ?? null,
  };
}
