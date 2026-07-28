import "server-only";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { ServerContext } from "@/composition/server-context";
import { PrismaUserRepository } from "../infrastructure/prisma-user.repository";
import { BcryptPasswordHasher } from "../infrastructure/bcrypt-password-hasher";
import { RedisSessionRevocation } from "../infrastructure/redis-session-revocation";
import { RegisterUserUseCase } from "../application/use-cases/register-user.use-case";
import { AuthenticateUserUseCase } from "../application/use-cases/authenticate-user.use-case";
import type { SessionRevocationPort } from "../application/ports/session-revocation";

/**
 * Composition factories for the identity module. The ONLY place that knows
 * about both application ports and their concrete Prisma / bcrypt
 * implementations (rule 6 of the architecture).
 */

export function createRegisterUserUseCase(
  ctx: ServerContext,
): RegisterUserUseCase {
  const users = new PrismaUserRepository(ctx.db);
  const hasher = new BcryptPasswordHasher();
  return new RegisterUserUseCase(users, hasher, ctx.clock, ctx.ids);
}

/**
 * AuthenticateUserUseCase is invoked from NextAuth's Credentials `authorize`
 * callback, which runs BEFORE a session exists. Calling the full
 * `getServerContext()` there would recursively invoke `auth()` — so this
 * factory accepts only the narrow slice of ctx it actually needs.
 */
export function createAuthenticateUserUseCase(deps: {
  db: PrismaClient;
}): AuthenticateUserUseCase {
  const users = new PrismaUserRepository(deps.db);
  const hasher = new BcryptPasswordHasher();
  return new AuthenticateUserUseCase(users, hasher);
}

/**
 * SessionRevocation is queried on every authenticated request via the
 * NextAuth JWT callback, so the adapter is instantiated once as a module-
 * level singleton wrapping the shared Redis client — do NOT construct it
 * per request.
 */
export function createSessionRevocation(deps: {
  redis: Redis;
}): SessionRevocationPort {
  return new RedisSessionRevocation(deps.redis);
}
