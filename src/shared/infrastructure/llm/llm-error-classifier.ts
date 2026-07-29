import "server-only";

/**
 * Server-side classification of upstream LLM errors into stable codes.
 *
 * Two responsibilities:
 *
 * 1. **`classifyLlmError`** — turn an unknown thrown value (OpenAI SDK
 *    error, plain `Error`, string, …) into a `{ code, loggable }` pair.
 *    The `code` is the SAME wire literal the client understands
 *    (`RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, …). `loggable` is a
 *    server-only string for `console.warn` — never sent to the browser.
 *
 * 2. **`isTransientLlmError`** — decide whether to retry. Kept separate
 *    so the retry policy can differ from the client-facing copy (e.g.
 *    we retry `RATE_LIMITED` server-side even though the copy tells the
 *    user "try again"; the two can co-exist because the retry loop is
 *    silent).
 *
 * Codes are duplicated as a string literal (rather than imported from
 * the client-side module) so this server-only file has zero client
 * imports and vice-versa — the wire contract is the only coupling.
 */

export type ServerChatErrorCode =
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "CONTENT_FILTERED"
  | "NETWORK"
  | "UNKNOWN";

interface ClassifiedError {
  readonly code: ServerChatErrorCode;
  /** Human-readable string suitable ONLY for server logs. */
  readonly loggable: string;
}

/**
 * Best-effort extraction of an HTTP status from anything an SDK could
 * throw. OpenAI SDK errors expose `.status`; fetch/undici wraps it
 * behind `.response.status`; some libraries stringify status into the
 * message. We check each shape defensively.
 */
function extractStatus(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const asRecord = e as Record<string, unknown>;
  if (typeof asRecord.status === "number") return asRecord.status;
  const response = asRecord.response;
  if (
    typeof response === "object" &&
    response !== null &&
    typeof (response as Record<string, unknown>).status === "number"
  ) {
    return (response as { status: number }).status;
  }
  // Some errors leak "429" into the message.
  if (e instanceof Error) {
    const m = /\b(4\d\d|5\d\d)\b/.exec(e.message);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function classifyLlmError(e: unknown): ClassifiedError {
  const status = extractStatus(e);
  const message = e instanceof Error ? e.message : String(e);

  if (status === 429 || /rate.?limit|too many requests|throttl/i.test(message)) {
    return { code: "RATE_LIMITED", loggable: message };
  }

  if (
    (typeof status === "number" && status >= 500 && status <= 599) ||
    /502|503|504|timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(
      message,
    )
  ) {
    return { code: "UPSTREAM_UNAVAILABLE", loggable: message };
  }

  if (
    status === 400 &&
    /(content|policy|moderation|flagged|safety|harmful|nsfw.*block)/i.test(
      message,
    )
  ) {
    return { code: "CONTENT_FILTERED", loggable: message };
  }

  if (status === undefined && /fetch failed|network|abort/i.test(message)) {
    return { code: "NETWORK", loggable: message };
  }

  return { code: "UNKNOWN", loggable: message };
}

/**
 * Whether a classified error is worth retrying. The retry loop
 * short-circuits on anything non-transient so we never burn budget
 * hammering a permanent 400.
 */
export function isTransientLlmError(e: unknown): boolean {
  const { code } = classifyLlmError(e);
  return (
    code === "RATE_LIMITED" ||
    code === "UPSTREAM_UNAVAILABLE" ||
    code === "NETWORK"
  );
}
