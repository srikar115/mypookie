/**
 * When may the character speak first?
 *
 * Plain TypeScript, no server-only pragma — the client uses it as a
 * pre-check to avoid a pointless round trip, and the opener route uses it
 * as the authoritative gate. Same rules on both sides.
 *
 * The client alone cannot enforce this. It remounts on navigation, runs
 * twice under StrictMode, survives reloads with a stale message list, and
 * can be open in two tabs. Each of those fires another opener, and every
 * opener is persisted as an assistant message — so they accumulate.
 *
 * That accumulation is the real damage. A thread whose recent history is
 * mostly unanswered greetings teaches the model that greeting is the
 * expected move, and it will keep greeting instead of replying to what the
 * user actually said. One production thread reached nine stacked openers,
 * after which every single reply came back as "hey stranger, long time no
 * chat" regardless of the message it was answering.
 */

import type { MessageDto } from "../application/dto/message.dto";

/**
 * How stale the last exchange must be before returning to the chat earns a
 * fresh "hey, you're back". Shorter than this and the character talking
 * unprompted reads as pushy rather than warm.
 */
export const OPENER_STALE_ASSISTANT_MS = 5 * 60 * 1000;

export type OpenerRefusal =
  | "awaiting_reply"
  | "opener_already_pending"
  | "too_recent"
  | "turn_in_progress";

export type OpenerDecision =
  | { readonly warranted: true }
  | { readonly warranted: false; readonly reason: OpenerRefusal };

/**
 * Minimal turn shape the policy needs. Declared separately from
 * `MessageDto` so the client can apply the identical rule to its own
 * `ChatMessage` list without either side reshaping to match the other.
 */
export interface OpenerTurn {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly at: Date;
}

/**
 * `history` must be in chronological order (oldest first) — the shape
 * `MessageRepository.listRecent` returns.
 */
export function decideOpener(
  history: readonly MessageDto[],
  now: Date,
  staleMs: number = OPENER_STALE_ASSISTANT_MS,
): OpenerDecision {
  return decideOpenerFromTurns(
    history.map((m) => ({
      role:
        m.role === "USER"
          ? ("user" as const)
          : m.role === "ASSISTANT"
            ? ("assistant" as const)
            : ("system" as const),
      content: m.content,
      at: new Date(m.createdAt),
    })),
    now,
    staleMs,
  );
}

export function decideOpenerFromTurns(
  history: readonly OpenerTurn[],
  now: Date,
  staleMs: number = OPENER_STALE_ASSISTANT_MS,
): OpenerDecision {
  const turns = history.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );

  // Nothing has ever been said — this is the one opener that needs no
  // justification.
  if (turns.length === 0) return { warranted: true };

  const last = turns[turns.length - 1];

  // The user spoke last and is waiting on a reply. Greeting them here is
  // the failure the user reported: they ask "shall we meet today" and get
  // "long time no chat" back.
  if (last.role === "user") {
    return { warranted: false, reason: "awaiting_reply" };
  }

  // An empty assistant row is a placeholder — either a media generation in
  // flight or a turn still streaming. Speaking over it duplicates the turn.
  if (last.content.trim().length === 0) {
    return { warranted: false, reason: "turn_in_progress" };
  }

  // The character already spoke without being prompted and the user hasn't
  // answered yet. Saying hello a second time just stacks greetings, which
  // is what poisons the history. Wait for the user.
  const previous = turns[turns.length - 2];
  if (!previous || previous.role !== "user") {
    return { warranted: false, reason: "opener_already_pending" };
  }

  // A real exchange happened; only re-open once it has gone cold.
  const ageMs = now.getTime() - last.at.getTime();
  if (ageMs < staleMs) {
    return { warranted: false, reason: "too_recent" };
  }

  return { warranted: true };
}
