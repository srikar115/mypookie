"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import emojiRegex from "emoji-regex";

/**
 * Twemoji rendering for chat text.
 *
 * Why we bother: native emoji fonts vary wildly by OS. Windows renders
 * emojis with the 2015-era Segoe UI Emoji font (flat, dated); macOS
 * uses Apple Color Emoji; Android uses Noto; Chrome-on-Linux often
 * fails back to monochrome glyphs. Twemoji is the industry standard
 * for "everyone sees the same modern colourful emoji" — it's what
 * Twitter, Discord (in some contexts), and Candy.ai use.
 *
 * How this file works:
 *
 * 1. `emoji-regex` (Mathias Bynens' canonical regex, always up-to-date
 *    with the Unicode spec) matches every grapheme-cluster emoji in
 *    the input, including ZWJ sequences and skin-tone modifiers.
 *
 * 2. For each match we compute a Twemoji CDN URL from the emoji's
 *    codepoints. VS16 (U+FE0F) is stripped where Twemoji filenames
 *    don't include it — this matches Twemoji's own filename
 *    convention. Empty tokens fall through to raw text so a browser's
 *    native rendering can still take a shot at them.
 *
 * 3. The output is an array of React nodes (text strings + <img>
 *    elements). No `dangerouslySetInnerHTML` — the LLM's text is
 *    inserted as text nodes, so any stray `<script>` string would
 *    render literally rather than execute.
 *
 * Assets are served from jsDelivr's Twemoji mirror
 * (`cdn.jsdelivr.net/gh/jdecked/twemoji`) — the current
 * community-maintained fork after Twitter archived the original repo.
 * Requests are cached aggressively at the edge; per-emoji SVG payloads
 * are ~600 bytes each.
 */

const TWEMOJI_VERSION = "15.0.3";
const TWEMOJI_BASE = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;

/**
 * Turn a JavaScript emoji string into the codepoint-hyphenated filename
 * Twemoji uses (e.g. "😊" → "1f60a", "👩‍❤️‍💋‍👩" → the ZWJ sequence).
 *
 * VS16 (variation selector, U+FE0F) is dropped in most cases because
 * Twemoji filenames typically don't include it — the exception is a
 * short set of keycap-style emojis, but the jsdelivr mirror redirects
 * cleanly for those too, so we can safely strip everywhere.
 */
function emojiToTwemojiCodepoint(emoji: string): string {
  const codepoints: number[] = [];
  // Iterating the string with `for..of` yields full codepoints (handles
  // surrogate pairs correctly, unlike `emoji[i].charCodeAt(0)`).
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0f) continue;
    codepoints.push(cp);
  }
  return codepoints.map((cp) => cp.toString(16)).join("-");
}

/**
 * Split arbitrary text into a React-node array with emojis replaced by
 * inline Twemoji `<img>` elements. Non-emoji runs stay as plain text
 * nodes.
 *
 * The regex is stateful (`g` flag) so we call `emojiRegex()` fresh
 * every render; the factory returns a new RegExp each time, which is
 * what we want to keep the lastIndex bookkeeping isolated.
 */
export function renderTwemojiText(text: string): ReactNode[] {
  if (!text) return [text];

  const regex = emojiRegex();
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchCount = 0;

  for (const match of text.matchAll(regex)) {
    const emoji = match[0];
    const start = match.index ?? 0;
    // Push the plain-text run before this emoji.
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    const codepoint = emojiToTwemojiCodepoint(emoji);
    if (codepoint.length === 0) {
      // Something weird slipped through (e.g. lone VS16). Keep the
      // original characters so nothing goes missing.
      nodes.push(emoji);
    } else {
      nodes.push(
        // <Image> from next/image gives zero benefit here — Twemoji
        // SVGs are 20×20 vector assets served from a well-cached CDN
        // and rendered inline in text flow. `next/image` would only
        // add layout-shift risk and require whitelisting jsDelivr in
        // `remotePatterns`. Silencing the lint on this one line is
        // the cleanest signal that the choice is intentional.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`twemoji-${start}-${matchCount++}`}
          src={`${TWEMOJI_BASE}/${codepoint}.svg`}
          alt={emoji}
          draggable={false}
          className="inline-block h-[1.15em] w-[1.15em] align-[-0.15em] mx-[0.05em]"
          loading="lazy"
        />,
      );
    }
    lastIndex = start + emoji.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/**
 * Convenience component — most callers just want `<TwemojiText>{text}</TwemojiText>`
 * without thinking about node arrays. Memoized on the input string so
 * long transcripts don't re-parse every scroll frame.
 */
export function TwemojiText({ text }: { text: string }) {
  const nodes = useMemo(() => renderTwemojiText(text), [text]);
  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}

/**
 * Split a chat body into alternating "text" and "action" segments.
 *
 * Roleplay models emit action beats wrapped in single asterisks, e.g.
 *   *she leans in, her voice dropping* Are you okay?
 *
 * We highlight action beats in a soft italic purple to match Candy's
 * visual convention — it reads as stage direction and makes the actual
 * dialogue visually pop. Kept as its own tokenizer (not a Markdown
 * parser) because we specifically want to ignore **bold** / ***italic
 * bold*** — models sometimes fall into them and they'd render as
 * broken half-styled fragments if we tried to be clever.
 *
 * Regex notes:
 *  - `[^*\n]+` prevents a stray unbalanced `*` on the next line from
 *    swallowing multiple paragraphs.
 *  - Match is greedy WITHIN a line — safe because a single line rarely
 *    has adjacent action beats without at least one space between.
 *  - The captured group is the content WITHOUT the asterisks; we
 *    re-emit the asterisks in the rendered output so the styled span
 *    exactly matches Candy's look ("*she smiles*" in purple italic).
 */
const ACTION_BEAT_RE = /\*([^*\n]+)\*/g;

type MessageSegment =
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "action"; readonly content: string };

export function splitMessageIntoSegments(text: string): MessageSegment[] {
  if (!text) return [{ kind: "text", content: "" }];
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(ACTION_BEAT_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ kind: "text", content: text.slice(cursor, start) });
    }
    segments.push({ kind: "action", content: match[1] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", content: text.slice(cursor) });
  }
  if (segments.length === 0) segments.push({ kind: "text", content: text });
  return segments;
}

/**
 * The rich chat renderer: action beats in italic purple, everything
 * else in plain body text, emoji glyphs swapped to Twemoji SVGs
 * throughout. Use this in `MessageBubble` instead of `TwemojiText`
 * whenever we're rendering a companion's reply — user messages don't
 * use asterisk conventions, so plain `TwemojiText` still works for
 * their bubbles (though `MessageText` is a safe superset).
 *
 * Colour choice: `text-purple-300` (Tailwind #d8b4fe) matches Candy's
 * light-lavender action-beat tone almost exactly and reads well on
 * both the dark assistant bubble (#1a1a22) and the pink user bubble
 * (unlikely case, but graceful).
 */
export function MessageText({ text }: { text: string }) {
  const segments = useMemo(() => splitMessageIntoSegments(text), [text]);

  return (
    <>
      {segments.map((seg, i) => {
        const inner = renderTwemojiText(seg.content);
        if (seg.kind === "action") {
          return (
            <em
              key={i}
              className="italic text-purple-300/90 font-normal"
            >
              *
              {inner.map((n, j) => (
                <Fragment key={j}>{n}</Fragment>
              ))}
              *
            </em>
          );
        }
        return (
          <Fragment key={i}>
            {inner.map((n, j) => (
              <Fragment key={j}>{n}</Fragment>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
