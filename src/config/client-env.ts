/**
 * Client-safe public environment flags.
 *
 * NEXT_PUBLIC_* variables are inlined by Next.js at build time, so this
 * file is the one place we read them — exactly mirroring the pattern that
 * src/config/env.ts follows for server-only variables.
 *
 * Rules:
 *   - Only NEXT_PUBLIC_* variables belong here.
 *   - No imports from "server-only" modules.
 *   - Consumed by both Client Components and (optionally) Server Components.
 */

function boolFlag(raw: string | undefined): boolean {
  return raw === "true" || raw === "1";
}

export const clientEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "Amorify",

  NEXT_PUBLIC_VOICE_CALLS_ENABLED: boolFlag(
    process.env.NEXT_PUBLIC_VOICE_CALLS_ENABLED,
  ),
  NEXT_PUBLIC_CHAT_MEDIA_ENABLED: boolFlag(
    process.env.NEXT_PUBLIC_CHAT_MEDIA_ENABLED,
  ),
  NEXT_PUBLIC_CHAT_VIDEO_ENABLED: boolFlag(
    process.env.NEXT_PUBLIC_CHAT_VIDEO_ENABLED,
  ),
} as const;
