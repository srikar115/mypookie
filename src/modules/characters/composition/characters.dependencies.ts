import "server-only";
import type { ServerContext } from "@/composition/server-context";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { PrismaCharacterRepository } from "../infrastructure/prisma-character.repository";
import { PrismaLookupResolver } from "../infrastructure/prisma-lookup-resolver";
import { PrismaWizardPreviewRepository } from "../infrastructure/prisma-wizard-preview.repository";
import type { WizardPreviewRepository } from "../application/ports/wizard-preview-repository";
import { TemplatePromptCompiler } from "../infrastructure/template-prompt-compiler";
import { FalImageGenerator } from "../infrastructure/fal-image-generator";
import { LlmTaglineGenerator } from "../infrastructure/llm-tagline-generator";
import { GetCharacterLookupsUseCase } from "../application/use-cases/get-character-lookups.use-case";
import { CreateCharacterDraftUseCase } from "../application/use-cases/create-character-draft.use-case";
import { RegenerateCharacterImageUseCase } from "../application/use-cases/regenerate-character-image.use-case";
import { RegenerateCharacterTaglineUseCase } from "../application/use-cases/regenerate-character-tagline.use-case";
import { CommitCharacterUseCase } from "../application/use-cases/commit-character.use-case";

/**
 * Composition factories for the characters module. Wires the concrete
 * Prisma / fal.ai / template implementations into use cases. Following
 * architecture rule 6: this is the ONLY place that sees both application
 * ports and their concrete infra adapters.
 */

export function createGetCharacterLookupsUseCase(
  ctx: ServerContext,
): GetCharacterLookupsUseCase {
  const repo = new PrismaCharacterRepository(ctx.db);
  return new GetCharacterLookupsUseCase(repo);
}

export function createCreateCharacterDraftUseCase(
  ctx: ServerContext,
): CreateCharacterDraftUseCase {
  const repo = new PrismaCharacterRepository(ctx.db);
  const lookups = new PrismaLookupResolver(ctx.db);
  const prompts = new TemplatePromptCompiler();
  const images = new FalImageGenerator(ctx.models);
  const tagline = new LlmTaglineGenerator(new OpenRouterChatLlm(), ctx.models);
  return new CreateCharacterDraftUseCase(
    repo,
    prompts,
    images,
    tagline,
    ctx.clock,
    ctx.ids,
    lookups,
  );
}

export function createRegenerateCharacterTaglineUseCase(
  ctx: ServerContext,
): RegenerateCharacterTaglineUseCase {
  const repo = new PrismaCharacterRepository(ctx.db);
  const tagline = new LlmTaglineGenerator(new OpenRouterChatLlm(), ctx.models);
  return new RegenerateCharacterTaglineUseCase(repo, tagline);
}

export function createRegenerateCharacterImageUseCase(
  ctx: ServerContext,
): RegenerateCharacterImageUseCase {
  const repo = new PrismaCharacterRepository(ctx.db);
  const images = new FalImageGenerator(ctx.models);
  return new RegenerateCharacterImageUseCase(repo, images);
}

export function createCommitCharacterUseCase(
  ctx: ServerContext,
): CommitCharacterUseCase {
  const repo = new PrismaCharacterRepository(ctx.db);
  return new CommitCharacterUseCase(repo, ctx.clock);
}

/**
 * Character reads (findDtoById) don't need a use-case wrapper — they're
 * pure queries with no business rules. Expose the read side directly so
 * pages can call it without an extra hop.
 */
export function createCharacterReadRepository(ctx: ServerContext) {
  return new PrismaCharacterRepository(ctx.db);
}

/**
 * Wizard v2 preview lookups — pure read port, so exposed directly (same
 * pattern as `createCharacterReadRepository`). The seeder script imports
 * the concrete adapter directly to write rows; runtime callers use this
 * factory.
 */
export function createWizardPreviewRepository(
  ctx: ServerContext,
): WizardPreviewRepository {
  return new PrismaWizardPreviewRepository(ctx.db);
}
