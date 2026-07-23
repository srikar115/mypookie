import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no Node.js crypto)
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      if (pathname.startsWith("/app") && !isLoggedIn) return false;
      if (pathname.startsWith("/admin") && !isLoggedIn) return false;

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      // Always refresh role from DB so admin grants take effect without re-login
      if (token.id) {
        try {
          const { default: prisma } = await import("@/lib/db");
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, status: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            // Invalidate session if user was suspended
            if (dbUser.status === "SUSPENDED") {
              return { ...token, error: "suspended" };
            }
          }
        } catch { /* non-fatal: use cached role */ }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
