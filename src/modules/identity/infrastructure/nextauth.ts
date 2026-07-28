import "server-only";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import prisma from "@/shared/infrastructure/db/prisma";
import redis from "@/shared/infrastructure/cache/redis";
import { authConfig } from "./nextauth-config";
import {
  createAuthenticateUserUseCase,
  createSessionRevocation,
} from "../composition/identity.dependencies";

/**
 * Transport-shape validation for the incoming credentials payload. Domain
 * validation (email format, password strength) happens inside the use case.
 */
const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Instantiate the session-revocation gate ONCE at module load. The gate
 * wraps the shared Redis singleton, so this is effectively free — we're
 * just capturing a reference. Do NOT construct this per request; the JWT
 * callback below runs on every authenticated read.
 */
const sessionRevocation = createSessionRevocation({ redis });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const useCase = createAuthenticateUserUseCase({ db: prisma });
        const result = await useCase.execute({
          email: parsed.data.email,
          password: parsed.data.password,
        });

        // Any failure — bad email, wrong password, suspended, or missing
        // compliance flags — is collapsed to `null` at this boundary so we
        // don't leak which case applied.
        if (!result.ok) return null;

        return {
          id: result.value.id,
          email: result.value.email,
          name: result.value.name,
          role: result.value.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Runs on every request that reads the session.
     *
     * On the initial sign-in tick, `user` is populated by the Credentials
     * provider and we copy identity onto the token. On every subsequent
     * tick we check the Redis revocation gate — if the user has been
     * suspended / kicked since their token was issued, we tag the token
     * with `error: "revoked"` and the session callback in nextauth-config
     * strips identity so the request runs anonymously.
     *
     * Cost per request: one Redis EXISTS command (~1ms). No Postgres round
     * trip. Fail-open on Redis outage — see RedisSessionRevocation.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      if (token.id) {
        const revoked = await sessionRevocation.isRevoked(token.id as string);
        if (revoked) {
          return { ...token, error: "revoked" };
        }
      }
      return token;
    },
  },
});
