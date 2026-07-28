/**
 * UI-only formatters shared across the chat panels. Kept as tiny pure
 * functions so components stay declarative and easy to unit test later.
 *
 * We pin the locale to `en-US` on every format call. `Intl` output varies
 * between Node (server render) and the browser — most notably casing of
 * meridian markers ("PM" vs "pm") — which manifests as a React hydration
 * mismatch. A fixed locale eliminates that class of drift and matches
 * the candy.ai visual style.
 */

const LOCALE = "en-US";

/** Short clock like "1:01 AM" — used on message bubbles + sidebar previews. */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact relative label for the sidebar: "1:01 AM", "Yesterday", "Mon". */
export function formatSidebarStamp(d: Date, now: Date = new Date()): string {
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatClock(d);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";

  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return d.toLocaleDateString(LOCALE, { weekday: "short" });
  }
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}
