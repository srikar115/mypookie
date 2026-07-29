import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(credits: number): string {
  return credits.toLocaleString();
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

/**
 * Turn a human character name into a URL-friendly slug for the canonical
 * chat route `/ai-girlfriend/<slug>?conversation_id=<uuid>`.
 *
 * The slug is decorative — real identity always comes from the
 * conversation ID query param — so we don't try to guarantee
 * uniqueness. What we do guarantee:
 *
 * - Lowercased.
 * - Diacritics stripped (Zoë → zoe) via NFD.
 * - Non-alphanumerics collapsed into single dashes.
 * - Leading/trailing dashes trimmed.
 * - Empty names get "character" so we never build a route with a bare
 *   trailing slash.
 *
 * Kept in shared/presentation so both server pages (link building) and
 * the wizard client (post-submit navigation) can call it without
 * duplicating the algorithm.
 */
export function slugifyName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "character";
}
