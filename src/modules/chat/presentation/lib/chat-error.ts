/**
 * Client-safe classification of streaming errors for the chat UI.
 *
 * The server never sends raw provider messages to the browser — it emits
 * a stable `code` string on the SSE `error` event and the client maps
 * that to (a) an in-character friendly message and (b) whether a
 * one-tap retry makes sense.
 *
 * Keeping this file free of server-only imports lets both the client
 * hook (parse incoming events) and Message bubble (render copy)
 * consume it directly.
 */

/**
 * Wire-level error codes emitted by `/api/chat/[conversationId]/stream`.
 * Kept as a string literal union (no enum) so future codes are additive
 * — the client's `parseChatErrorCode()` falls back to `UNKNOWN` for
 * anything it doesn't recognise, so a new server code never breaks an
 * older client.
 */
export type ChatErrorCode =
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "CONTENT_FILTERED"
  | "NETWORK"
  | "UNKNOWN";

const KNOWN_CODES: ReadonlySet<string> = new Set<ChatErrorCode>([
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "CONTENT_FILTERED",
  "NETWORK",
  "UNKNOWN",
]);

/**
 * Normalize whatever the SSE payload gives us into a known code. Used
 * both when parsing `{ type: "error", code }` events and when a plain
 * `fetch` fails outright (in which case we synthesise `NETWORK`).
 */
export function parseChatErrorCode(raw: unknown): ChatErrorCode {
  if (typeof raw === "string" && KNOWN_CODES.has(raw)) {
    return raw as ChatErrorCode;
  }
  return "UNKNOWN";
}

/**
 * Which codes are worth offering a retry on. `CONTENT_FILTERED` is
 * intentionally excluded — a bare "retry" would just fail the same way
 * with the same content; the user needs to rephrase.
 */
export function isRetryableChatError(code: ChatErrorCode): boolean {
  return (
    code === "RATE_LIMITED" ||
    code === "UPSTREAM_UNAVAILABLE" ||
    code === "NETWORK" ||
    code === "UNKNOWN"
  );
}

/**
 * The line the user actually reads. Written to keep the illusion of a
 * character on the other side alive: no HTTP codes, no "provider", no
 * mention of models. The `characterName` is folded in so the message
 * feels addressed rather than systemic.
 *
 * Product copy — tweak here, not at call sites.
 */
export function friendlyChatErrorMessage(
  code: ChatErrorCode,
  characterName: string,
): string {
  const name = characterName.trim().length > 0 ? characterName.trim() : "She";
  switch (code) {
    case "RATE_LIMITED":
      return `${name} is getting a lot of messages right now — give her a second and try again.`;
    case "UPSTREAM_UNAVAILABLE":
      return `${name} zoned out for a moment. Tap retry to nudge her.`;
    case "CONTENT_FILTERED":
      return `${name} didn't feel comfortable with that — try phrasing it a different way.`;
    case "NETWORK":
      return `Your connection blipped. Tap retry to send it again.`;
    case "UNKNOWN":
    default:
      return `Something went sideways. Tap retry to try again.`;
  }
}
