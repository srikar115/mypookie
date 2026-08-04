/**
 * Prints the assistant turns the model actually sees for a live thread.
 * Media placeholders should read as "*sends him a photo*", never as "".
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { TemplatePromptComposer } from "../src/modules/chat/infrastructure/template-prompt-composer";
import type { MessageDto } from "../src/modules/chat/application/dto/message.dto";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({
  adapter,
} as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const conv = await prisma.conversation.findFirst({
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (!conv) return console.log("no conversations");

  const rows = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    include: { mediaGeneration: { select: { kind: true, status: true } } },
  });

  const history: MessageDto[] = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    role: r.role,
    status: r.status,
    source: r.source,
    content: r.content,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    modelId: r.modelId,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
    mediaGenerationId: r.mediaGenerationId,
    mediaStatus: r.mediaGeneration?.status ?? null,
    mediaUrl: null,
    mediaKind: r.mediaGeneration?.kind ?? null,
  }));

  const composer = new TemplatePromptComposer();
  const messages = composer.compose({
    character: {
      id: "x",
      name: "Banana",
      systemPrompt: "<system>",
    } as never,
    memoryBlock: "<memory>",
    history,
    latestUserMessage: "shall we meet today",
  });

  console.log(`${history.length} db rows → ${messages.length} prompt messages\n`);
  for (const m of messages) {
    if (m.role === "system") {
      console.log(`system    <${m.content.length} chars>`);
      continue;
    }
    console.log(`${m.role.padEnd(9)} ${JSON.stringify(m.content.slice(0, 72))}`);
  }

  const blanks = messages.filter(
    (m) => m.role === "assistant" && m.content.trim().length === 0,
  ).length;
  console.log(`\nblank assistant turns reaching the model: ${blanks}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
