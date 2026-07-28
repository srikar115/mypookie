"use client";

import { useCallback, useState } from "react";
import type { ChatMessage } from "../components/MessageBubble";

/**
 * useChatStream — owns the message list for a single conversation and the
 * SSE stream lifecycle.
 *
 * The workspace treats each character's thread as an independent scope
 * (`key={conversationId}`), so this hook is remounted when the user
 * switches companions. That keeps the reducer simple and prevents
 * mid-stream messages from being spliced into the wrong thread.
 */

interface UseChatStreamOptions {
  readonly conversationId: string | null;
  readonly initialMessages: readonly ChatMessage[];
}

interface UseChatStreamResult {
  readonly messages: readonly ChatMessage[];
  readonly streaming: boolean;
  readonly send: (text: string) => Promise<void>;
  readonly lastError: string | null;
}

interface SseEvent {
  type: "text_delta" | "done" | "error";
  delta?: string;
  messageId?: string;
  message?: string;
}

export function useChatStream({
  conversationId,
  initialMessages,
}: UseChatStreamOptions): UseChatStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    ...initialMessages,
  ]);
  const [streaming, setStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // "Adjusting state on prop change" pattern — reset the thread when the
  // conversation id changes, without a useEffect (avoids the setState-in-
  // effect cascade warning). Consumers usually remount via
  // `key={conversationId}` too, but this keeps the hook robust either way.
  const [syncedConversationId, setSyncedConversationId] = useState(conversationId);
  if (syncedConversationId !== conversationId) {
    setSyncedConversationId(conversationId);
    setMessages([...initialMessages]);
    setLastError(null);
    setStreaming(false);
  }

  const send = useCallback(
    async (text: string): Promise<void> => {
      if (!conversationId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      // Rely on the caller (ChatConversation) to gate double-sends via the
      // `streaming` flag it reads. `setStreaming(true)` schedules a render;
      // React 18 batching keeps the two setStates coherent.
      setStreaming(true);
      setLastError(null);

      const now = new Date();
      const userTempId = `temp-user-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      const assistantTempId = `temp-asst-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

      setMessages((prev) => [
        ...prev,
        { id: userTempId, role: "user", text: trimmed, at: now },
        {
          id: assistantTempId,
          role: "assistant",
          text: "",
          at: new Date(),
          streaming: true,
        },
      ]);

      const patchAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantTempId ? { ...m, ...patch } : m)),
        );
      };

      try {
        const res = await fetch(`/api/chat/${conversationId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });

        if (!res.ok || !res.body) {
          const errText = await safeReadJsonError(res);
          patchAssistant({
            streaming: false,
            errorMessage: errText,
            text: "",
          });
          setLastError(errText);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let finalMessageId: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = extractEvents(buffer);
          buffer = events.remainder;
          for (const evt of events.parsed) {
            if (evt.type === "text_delta" && typeof evt.delta === "string") {
              accumulated += evt.delta;
              patchAssistant({ text: accumulated, streaming: true });
            } else if (evt.type === "done" && typeof evt.messageId === "string") {
              finalMessageId = evt.messageId;
            } else if (evt.type === "error") {
              const msg = evt.message ?? "Unknown streaming error.";
              patchAssistant({
                streaming: false,
                errorMessage: msg,
                text: accumulated,
              });
              setLastError(msg);
            }
          }
        }

        if (finalMessageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantTempId
                ? { ...m, id: finalMessageId!, streaming: false, text: accumulated }
                : m,
            ),
          );
        } else {
          // Stream closed without a `done` event — treat as soft error but
          // keep the accumulated text.
          patchAssistant({ streaming: false, text: accumulated });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error.";
        patchAssistant({ streaming: false, errorMessage: msg, text: "" });
        setLastError(msg);
      } finally {
        setStreaming(false);
      }
    },
    [conversationId],
  );

  return { messages, streaming, send, lastError };
}

/**
 * Splits an SSE buffer on double-newline boundaries, parses each `data:`
 * payload as JSON, and returns { parsed events, unconsumed remainder }.
 */
function extractEvents(buffer: string): {
  parsed: SseEvent[];
  remainder: string;
} {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const parsed: SseEvent[] = [];
  for (const chunk of parts) {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) continue;
    // Each chunk may have multiple `data:` lines — SSE spec joins them.
    const dataLines = trimmed
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const payload = dataLines.join("\n");
    try {
      const evt = JSON.parse(payload) as SseEvent;
      parsed.push(evt);
    } catch {
      // Skip malformed events silently — the stream may recover.
    }
  }
  return { parsed, remainder };
}

async function safeReadJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
