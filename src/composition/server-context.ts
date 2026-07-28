import "server-only";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import prisma from "@/shared/infrastructure/db/prisma";
import redis from "@/shared/infrastructure/cache/redis";
import { SystemClock, type Clock } from "@/shared/application/clock";
import { UuidGenerator, type IdGenerator } from "@/shared/application/id-generator";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import { PrismaModelConfigRepository } from "@/shared/infrastructure/model-config/prisma-model-config.repository";
import { auth } from "@/modules/identity";

/**
 * ServerContext — the single object passed to every use-case composition
 * factory. Holds the authenticated actor plus request-shared infrastructure.
 *
 * Read section 5.5 of `.agents/docs/nextjs_fullstack_solid_modular_architecture.docx`
 * before extending this shape.
 *
 * When a page, Server Action, or Route Handler needs a use case, it does:
 *
 *   const ctx = await getServerContext();
 *   const useCase = createXUseCase(ctx);
 *   const result = await useCase.execute({ actorId: ctx.actor.id, ... });
 *
 * The actor is optional: unauthenticated flows (public homepage, login) call
 * `getServerContext()` and simply ignore `ctx.actor`.
 */

export interface ActorContext {
  readonly id: string;
  readonly email: string | null;
  readonly role: string;
}

export interface ServerContext {
  readonly actor: ActorContext | null;
  readonly db: PrismaClient;
  readonly redis: Redis;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Admin-tunable model configuration (LLM + image + embedding). */
  readonly models: ModelConfigRepository;
}

const clock = new SystemClock();
const ids = new UuidGenerator();
// Singleton so the in-process TTL cache is shared across requests. It only
// holds ~10 rows worth of data — safe for edge/serverless too.
const models = new PrismaModelConfigRepository(prisma);

export async function getServerContext(): Promise<ServerContext> {
  const session = await auth();
  const user = session?.user ?? null;

  const actor: ActorContext | null =
    user && (user as { id?: string }).id
      ? {
          id: (user as { id: string }).id,
          email: user.email ?? null,
          role: (user as { role?: string }).role ?? "USER",
        }
      : null;

  return {
    actor,
    db: prisma,
    redis,
    clock,
    ids,
    models,
  };
}
