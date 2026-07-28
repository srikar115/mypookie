import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config (no Node.js APIs).
 *
 * `/login` and `/signup` pages have been removed — auth happens through
 * the AuthDialog on the homepage. `signIn` still points at "/" so any
 * NextAuth server-side redirects land on the marketing site (where the
 * modal can be re-opened).
 *
 * ─── Session lifetime ────────────────────────────────────────────────────
 * Auth.js v5's Credentials provider only supports the JWT session strategy,
 * so the cookie IS the session — there is no server-side row to revoke. To
 * keep exposure bounded we set an explicit rolling expiry:
 *
 *   • `maxAge`    = 7 days   — token expires 7 days after last activity
 *   • `updateAge` = 24 hours — bump the exp claim at most once per 24h
 *
 * A user active daily keeps their session alive indefinitely; a user away
 * for a full week must sign in again. Adjust `SESSION_MAX_AGE_SECONDS` if
 * your risk model calls for a shorter window.
 */

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/",
    error: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      // No authenticated routes exist yet — everything under (public) is open.
      // When we add gated routes (/app, /admin, etc.), reintroduce guards here.
      void auth;
      return true;
    },
    /**
     * Base `jwt` callback — sets identity on the initial sign-in tick. The
     * full `nextauth.ts` wraps this and additionally consults the Redis
     * SessionRevocation gate on every request. Kept edge-safe (no infra
     * imports) so this config can be shared with any future middleware.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      // A revoked token still round-trips through the session callback (the
      // JWT is still cryptographically valid). Strip identity so downstream
      // code — `getServerContext`, layouts, guards — treats the request as
      // anonymous. The cookie remains until the browser makes its next
      // request that would clear it, or until natural expiry.
      if (token.error === "revoked") {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
