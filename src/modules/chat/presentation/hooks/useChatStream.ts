"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../components/MessageBubble";
import { parseChatErrorCode } from "../lib/chat-error";
import { dtoToChatMessage } from "../lib/dto-mapper";
import { listMessagesAction } from "../actions/list-messages.action";
import { sanitizeAssistantReply } from "../../domain/sanitize-reply";

/**
 * useChatStream — owns the message list for a single conversation and the
 * SSE stream lifecycle.
 *
 * Send-side timeline (Candy.ai / iMessage-style "human presence"):
 *
 *   ┌─ user hits Enter
 *   ├─ user message appears instantly
 *   ├─ `reading` phase (400–2500ms, scaled by message length)
 *   │     UI shows a muted "<name> is reading…" line (no dots) —
 *   │     the character is silently absorbing what the user typed.
 *   ├─ empty assistant bubble inserted + `POST /api/chat/…/stream` fires
 *   │     UI switches to the pulsing "<name> is typing…" dots and
 *   │     STAYS there while tokens accumulate off-screen.
 *   └─ on `done` → dots vanish, the finished reply appears in one shot.
 *
 * Design note — why we buffer instead of revealing tokens live:
 *   Fast models (Cydonia @ 60+ tok/s over OpenRouter) deliver SSE deltas
 *   in irregular ~20–100 token chunks. Rendering those live produces a
 *   "text jumps in big steps" effect that reads worse than either real
 *   char-by-char typewriter animation OR a clean "typing… → message"
 *   swap. We pick the swap: it's the same UX pattern iMessage,
 *   WhatsApp, and Signal use, and it hides jitter from users.
 *
 * The reading pause is client-only. It's a UX affordance, not a
 * server-side wait — the network request is deferred so that combined
 * latency (pause + LLM first-token) still fits the ~2s human expectation.
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
  /** True from the moment `send()` fires until the stream is fully closed. */
  readonly streaming: boolean;
  /**
   * True only during the pre-stream reading pause. Distinct from
   * `streaming` so the UI can pick a *different* indicator (no dots,
   * quieter tone) for the reading beat.
   */
  readonly reading: boolean;
  readonly send: (text: string) => Promise<void>;
  /**
   * Re-runs the last user message. Removes the failed assistant bubble
   * (so the retry doesn't leave a scar in the transcript) and replays
   * reading → typing → stream without re-inserting the user's message.
   * Returns silently when there's nothing to retry.
   */
  readonly retry: () => Promise<void>;
  /**
   * Fires the character-initiated opener flow. UI shows the typing
   * indicator until the server responds with the composed message.
   * Silently no-ops if a stream is already in flight or if there's no
   * conversation loaded. Returns `true` if the opener was requested,
   * `false` if the call was skipped for any reason.
   */
  readonly initiateOpener: () => Promise<boolean>;
  /**
   * Re-fetches the full recent history from the server and replaces
   * the in-memory message list. Used after a voice call ends so the
   * spoken turns (persisted by the LiveKit agent worker) and the
   * "Live Phone Call ended" marker (persisted by EndCallUseCase)
   * flow into the transcript without a full page reload.
   *
   * No-op while a text stream is in flight — the SSE stream owns the
   * tail bubble and clobbering it would strand tokens.
   */
  readonly refresh: () => Promise<void>;
  readonly lastError: string | null;
}

interface SendOptions {
  /**
   * When true, the user message is NOT re-inserted — used by `retry()`
   * because the user's bubble is already in the list. Everything from
   * the reading phase onwards is identical to a fresh send.
   */
  readonly resend?: boolean;
}

/**
 * How long the character "reads" the user message before starting to
 * type. Scales roughly linearly with word count and is jittered so
 * consecutive replies don't feel mechanical. Capped at 2.5s so a very
 * long message never looks like the app hung.
 */
function computeReadingDelayMs(userText: string): number {
  const words = userText.trim().split(/\s+/).filter(Boolean).length;
  const base = 500;
  const perWord = 35;
  const cap = 2500;
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.min(cap, Math.round((base + words * perWord) * jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SseEvent {
  type: "text_delta" | "done" | "error";
  delta?: string;
  messageId?: string;
  /**
   * Present only on `error` frames. Stable machine code the client
   * maps to friendly copy via {@link parseChatErrorCode}.
   */
  code?: string;
  /** Kept for backwards compat; new clients ignore this in favour of `code`. */
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
  const [reading, setReading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Last user prompt is a ref, not state — nothing in the UI needs to
  // re-render when it changes and it survives the message-list
  // reducer's async churn. `retry()` reads it to replay a failed turn.
  const lastPromptRef = useRef<string | null>(null);

  // Silent-recovery counter. When a mid-stream error hits, we auto-fire
  // one retry so users never see the error unless it happens twice in
  // a row. Reset on every fresh user-typed message so the budget
  // renews per turn; manual "Retry" taps do NOT reset it (otherwise
  // sticky-failing providers could burn through the manual-retry
  // affordance behind the user's back).
  const autoRetriedRef = useRef(false);

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
    setReading(false);
    // NOTE: `lastPromptRef` is intentionally NOT cleared here — writing
    // a ref during render is banned by react-hooks/refs. In practice
    // the ChatWorkspace remounts this hook via `key={conversationId}`
    // whenever the user switches companions, so the ref resets to null
    // naturally. If a future refactor drops that key, add a
    // `useEffect(() => { lastPromptRef.current = null; },
    // [conversationId])` — not the inline reset.
  }

  const runSend = useCallback(
    async (text: string, opts: SendOptions = {}): Promise<void> => {
      if (!conversationId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      lastPromptRef.current = trimmed;
      // Fresh user turn → renew the silent auto-retry budget. Retries
      // triggered by `retry()` (or the internal auto-retry) pass
      // `resend: true` and MUST NOT reset the budget here.
      if (!opts.resend) {
        autoRetriedRef.current = false;
      }

      // Rely on the caller (ChatConversation) to gate double-sends via the
      // `streaming` flag it reads. `setStreaming(true)` schedules a render;
      // React 18 batching keeps the two setStates coherent.
      //
      // We enter `reading` *and* `streaming` at the same instant: reading
      // controls which indicator the UI paints; streaming controls the
      // composer's disabled state so a second Enter during the pause
      // can't queue a duplicate request.
      setStreaming(true);
      setReading(true);
      setLastError(null);

      const now = new Date();
      const userTempId = `temp-user-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      const assistantTempId = `temp-asst-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

      // Phase 1 — drop the user message immediately (unless this is a
      // retry, in which case the user's bubble is already in the list).
      // No assistant bubble yet, so `ChatConversation` will render the
      // "reading" indicator driven by the `reading` flag.
      if (!opts.resend) {
        setMessages((prev) => [
          ...prev,
          { id: userTempId, role: "user", text: trimmed, at: now },
        ]);
      }

      // Phase 2 — hold the "reading" beat, then insert the empty
      // assistant bubble which flips the UI into "typing" mode.
      const readingDelay = computeReadingDelayMs(trimmed);
      await sleep(readingDelay);
      setReading(false);
      setMessages((prev) => [
        ...prev,
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

      // Auto-retry decision is made mid-flight by the error handlers
      // and executed by the outer `finally` after cleanup. Codes are
      // the client-side classifier's — see `parseChatErrorCode`.
      let scheduledAutoRetryCode: string | null = null;
      const maybeScheduleAutoRetry = (code: string) => {
        if (autoRetriedRef.current) return; // budget exhausted
        // Only silently retry transient upstream issues. Content
        // filters and hard 4xx are excluded — the response wouldn't
        // change on retry, only user rephrasing helps.
        if (
          code === "RATE_LIMITED" ||
          code === "UPSTREAM_UNAVAILABLE" ||
          code === "NETWORK" ||
          code === "UNKNOWN"
        ) {
          scheduledAutoRetryCode = code;
        }
      };

      try {
        const res = await fetch(`/api/chat/${conversationId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });

        if (!res.ok || !res.body) {
          // Non-200 from the route (auth / validation / config) — treat
          // as a network-tier failure. The route emits SSE 200 for
          // upstream classification, so hitting this branch means the
          // request never made it to the LLM at all.
          const errText = await safeReadJsonError(res);
          patchAssistant({
            streaming: false,
            errorCode: "NETWORK",
            errorMessage: null,
            text: "",
          });
          setLastError(errText);
          maybeScheduleAutoRetry("NETWORK");
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
              // Accumulate silently — DO NOT patch the bubble yet. The
              // tail bubble is still `{ text: "", streaming: true }` so
              // ChatConversation keeps painting the typing indicator.
              // We only flip both fields (text + streaming) on `done`
              // below, which reveals the finished reply in one shot.
              accumulated += evt.delta;
            } else if (evt.type === "done" && typeof evt.messageId === "string") {
              finalMessageId = evt.messageId;
            } else if (evt.type === "error") {
              // Server sends a stable `code` — never the raw provider
              // message. We stash the code on the bubble so the
              // MessageBubble can render friendly in-character copy
              // and (conditionally) a Retry button. `errorMessage`
              // stays null in the modern flow.
              const code = parseChatErrorCode(evt.code);
              patchAssistant({
                streaming: false,
                errorCode: code,
                errorMessage: null,
                text: accumulated,
              });
              setLastError(code);
              maybeScheduleAutoRetry(code);
            }
          }
        }

        // Match the server-side scrub in stream/route.ts. The SSE
        // deltas arrive raw (the model may echo `[voice call]` tags);
        // sanitize before revealing the bubble so the UI never shows
        // system metadata or TTS bracket markers.
        const cleaned = sanitizeAssistantReply(accumulated);

        if (finalMessageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantTempId
                ? { ...m, id: finalMessageId!, streaming: false, text: cleaned }
                : m,
            ),
          );
        } else {
          // Stream closed without a `done` event — treat as soft error but
          // keep the accumulated text.
          patchAssistant({ streaming: false, text: cleaned });
        }
      } catch (e) {
        // Fetch itself blew up (offline, DNS, aborted). Never surface
        // the raw exception text — categorise as NETWORK and let the
        // bubble render friendly copy.
        const raw = e instanceof Error ? e.message : "network";
        patchAssistant({
          streaming: false,
          errorCode: "NETWORK",
          errorMessage: null,
          text: "",
        });
        setLastError(raw);
        maybeScheduleAutoRetry("NETWORK");
      } finally {
        setStreaming(false);
        // Defense-in-depth: if `reading` somehow survived (e.g. an
        // error was thrown while the sleep was in flight — currently
        // it can't, but a future refactor might) we clear it here.
        setReading(false);

        // Silent auto-retry (at most once per user turn). Deferred to
        // the finally block so the current send has fully unwound
        // before the next one starts — no state races, no overlapping
        // streams. Delay is short enough to feel like a recovery
        // rather than a fresh reply; long enough that the friendly
        // error copy is visible for a beat.
        if (scheduledAutoRetryCode !== null && !autoRetriedRef.current) {
          autoRetriedRef.current = true;
          const retryDelayMs = 800;
          setTimeout(() => {
            // Strip the failed tail bubble — same shape as manual
            // `retry()` — then replay the last prompt as a resend so
            // we don't insert a duplicate user message.
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (lastIdx < 0) return prev;
              const last = prev[lastIdx];
              if (last.role !== "assistant" || !last.errorCode) return prev;
              return prev.slice(0, lastIdx);
            });
            void runSend(trimmed, { resend: true });
          }, retryDelayMs);
        }
      }
    },
    [conversationId],
  );

  const send = useCallback(
    (text: string) => runSend(text),
    [runSend],
  );

  const retry = useCallback(async () => {
    const prompt = lastPromptRef.current;
    if (!prompt || !conversationId || streaming) return;

    // Strip the tail failed-assistant bubble in place — retry replaces
    // it, we don't want the transcript to grow a scar every time the
    // upstream hiccups.
    setMessages((prev) => {
      const lastIdx = prev.length - 1;
      if (lastIdx < 0) return prev;
      const last = prev[lastIdx];
      if (last.role !== "assistant" || !last.errorCode) return prev;
      return prev.slice(0, lastIdx);
    });

    await runSend(prompt, { resend: true });
  }, [conversationId, streaming, runSend]);

  const initiateOpener = useCallback(async (): Promise<boolean> => {
    // Refuse if there's no thread yet or a turn is already in-flight.
    // The caller (ChatConversation) is also gated on these flags, but
    // this defensive check makes the hook safe to call from anywhere.
    if (!conversationId || streaming || reading) return false;

    // Insert an empty streaming assistant bubble to drive the typing
    // indicator. Same visual as a normal turn: dots stay until we
    // splice in the finished text.
    const assistantTempId = `temp-opener-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setStreaming(true);
    setLastError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: assistantTempId,
        role: "assistant",
        text: "",
        at: new Date(),
        streaming: true,
      },
    ]);

    try {
      const res = await fetch(`/api/chat/${conversationId}/opener`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            skipped?: boolean;
            message?: { id: string; content: string; createdAt: string };
            error?: string;
            code?: string;
          }
        | null;

      // Server chose not to send an opener (e.g. the generation came
      // out as a near-duplicate of the character's previous message
      // and was suppressed). Not an error — strip the placeholder
      // and stay quiet.
      if (res.ok && body?.ok && body.skipped) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
        return false;
      }

      if (!res.ok || !body?.ok || !body.message) {
        // Opener failed — quietly strip the placeholder rather than
        // showing an error bubble. Openers are opportunistic; if the
        // model burped, better to say nothing than pester the user.
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantTempId),
        );
        setLastError(body?.code ?? `HTTP ${res.status}`);
        return false;
      }

      // Swap the temp placeholder for the finished message. Match
      // exactly the shape of a normal completed assistant bubble so
      // downstream code (retry gating, error rendering) treats it
      // identically.
      const finalId = body.message.id;
      const finalText = body.message.content;
      const finalAt = new Date(body.message.createdAt);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantTempId
            ? { ...m, id: finalId, streaming: false, text: finalText, at: finalAt }
            : m,
        ),
      );
      return true;
    } catch (e) {
      // Network blip — same silent-strip policy as above. Nothing to
      // show, nothing to retry; the user hasn't done anything yet.
      setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
      setLastError(e instanceof Error ? e.message : "network");
      return false;
    } finally {
      setStreaming(false);
    }
  }, [conversationId, streaming, reading]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    // Never clobber the tail while a stream is running — the SSE loop
    // is authoritative for that bubble.
    if (streaming || reading) return;
    try {
      const result = await listMessagesAction({ conversationId, limit: 50 });
      if (!result.ok) return;
      const server = result.messages.map(dtoToChatMessage);
      // Preserve any temp/optimistic rows the user might still see
      // (shouldn't happen given the streaming guard, but defensive).
      setMessages((prev) => {
        const temps = prev.filter((m) => m.id.startsWith("temp-"));
        return temps.length === 0 ? server : [...server, ...temps];
      });
    } catch (e) {
      console.warn("[useChatStream] refresh failed", e);
    }
  }, [conversationId, streaming, reading]);

  return {
    messages,
    streaming,
    reading,
    send,
    retry,
    initiateOpener,
    refresh,
    lastError,
  };
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
