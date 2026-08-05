import "server-only";
import type { ServerContext } from "@/composition/server-context";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { PrismaMediaGenerationRepository } from "../infrastructure/prisma-media-generation.repository";
import {
  createIngestTurnUseCase,
  createRecordFactsUseCase,
} from "@/modules/memory";
import { PrismaRecentConversationReader } from "../infrastructure/prisma-recent-conversation.reader";
import { LlmVisualSceneGrounder } from "../infrastructure/prompt/llm-visual-scene.grounder";
import { MemoryGeneratedMediaRecorder } from "../infrastructure/memory-generated-media.recorder";
import { PrismaReferenceImageResolver } from "../infrastructure/prisma-reference-image.resolver";
import { PrismaMediaModelResolver } from "../infrastructure/prisma-media-model.resolver";
import { PrismaCompanionVisualProfileReader } from "../infrastructure/prisma-companion-visual-profile.reader";
import { FalMediaGenerationAdapter } from "../infrastructure/fal-media-generation.adapter";
import { PassthroughCreditGateway } from "../infrastructure/passthrough-credit.gateway";
import { CompanionVisualPromptBuilderImpl } from "../infrastructure/prompt/companion-visual-prompt.builder";
import { StartMediaGenerationUseCase } from "../application/use-cases/start-media-generation.use-case";
import { RunMediaGenerationUseCase } from "../application/use-cases/run-media-generation.use-case";
import { PreviewMediaPromptUseCase } from "../application/use-cases/preview-media-prompt.use-case";
import { GetMediaStatusUseCase } from "../application/use-cases/get-media-status.use-case";
import { ListRecentMediaUseCase } from "../application/use-cases/list-recent-media.use-case";

// ─── Factory helpers ──────────────────────────────────────────────────────────

// One HTTP client for the scene grounder, reused across requests. Module-local
// rather than on ServerContext so its lifecycle mirrors media's, matching how
// the memory module holds its own.
let sharedChatLlm: ChatLlm | null = null;
function getChatLlm(): ChatLlm {
  if (!sharedChatLlm) sharedChatLlm = new OpenRouterChatLlm();
  return sharedChatLlm;
}

export function createStartMediaGenerationUseCase(ctx: ServerContext) {
  const repo = new PrismaMediaGenerationRepository(ctx.db);
  const credits = new PassthroughCreditGateway();
  // TODO(billing): swap PassthroughCreditGateway for the real credits adapter
  // when @/modules/credits lands — only this line changes.
  return new StartMediaGenerationUseCase(repo, credits, ctx.db, ctx.ids);
}

export function createRunMediaGenerationUseCase(ctx: ServerContext) {
  const repo = new PrismaMediaGenerationRepository(ctx.db);
  const generator = new FalMediaGenerationAdapter();
  const refResolver = new PrismaReferenceImageResolver(ctx.db);
  const modelResolver = new PrismaMediaModelResolver(ctx.db);
  const credits = new PassthroughCreditGateway();
  const visualProfile = new PrismaCompanionVisualProfileReader(ctx.db);
  const promptBuilder = new CompanionVisualPromptBuilderImpl();
  return new RunMediaGenerationUseCase(
    repo,
    generator,
    refResolver,
    modelResolver,
    credits,
    visualProfile,
    promptBuilder,
    new PrismaRecentConversationReader(ctx.db),
    new LlmVisualSceneGrounder(getChatLlm(), ctx.models),
    new MemoryGeneratedMediaRecorder(
      createRecordFactsUseCase(ctx),
      createIngestTurnUseCase(ctx),
      ctx.db,
      ctx.clock,
    ),
  );
}

export function createPreviewMediaPromptUseCase(ctx: ServerContext) {
  return new PreviewMediaPromptUseCase(
    new PrismaReferenceImageResolver(ctx.db),
    new PrismaCompanionVisualProfileReader(ctx.db),
    new CompanionVisualPromptBuilderImpl(),
    new PrismaRecentConversationReader(ctx.db),
    new LlmVisualSceneGrounder(getChatLlm(), ctx.models),
    ctx.db,
  );
}

export function createGetMediaStatusUseCase(ctx: ServerContext) {
  const repo = new PrismaMediaGenerationRepository(ctx.db);
  return new GetMediaStatusUseCase(repo);
}

export function createListRecentMediaUseCase(ctx: ServerContext) {
  const repo = new PrismaMediaGenerationRepository(ctx.db);
  return new ListRecentMediaUseCase(repo);
}
