import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getCompanionById } from "@/lib/companions/companionService";
import { getMemory } from "@/lib/memory/memoryService";
import { getBalance } from "@/lib/billing/creditService";
import { getCreditCost } from "@/lib/billing/pricingService";
import { ChatInterface } from "@/components/chat/ChatInterface";
import prisma from "@/lib/db";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companionId: string }>;
}): Promise<Metadata> {
  const { companionId } = await params;
  const companion = await prisma.companion.findUnique({
    where: { id: companionId },
    select: { name: true },
  });
  return { title: companion ? `Chat with ${companion.name}` : "Chat" };
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ companionId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { companionId } = await params;
  const userId = session.user.id as string;

  // ── Load all data in parallel ──────────────────────────────────────────────
  const [companion, memory, credits, creditCost] = await Promise.all([
    getCompanionById(companionId, userId),
    getMemory(companionId, userId),
    getBalance(userId),
    getCreditCost("chat_message"),
  ]);

  if (!companion) notFound();

  // ── Get or create the active conversation ──────────────────────────────────
  let conversation = await prisma.conversation.findFirst({
    where: { userId, companionId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId,
        companionId,
        title: `Chat with ${companion.name}`,
      },
    });
  }

  // ── Load recent message history ────────────────────────────────────────────
  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      role: { in: ["USER", "ASSISTANT"] },
    },
    orderBy: { createdAt: "asc" },
    take: 60,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      mediaUrl: true,
      mediaType: true,
      metadata: true,
    },
  });

  return (
    // Fill the space below the topbar (h-16) and outside the layout padding (-m-6)
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-6">
      <ChatInterface
        companion={{
          id: companion.id,
          name: companion.name,
          companionType: companion.companionType,
          overallVibe: companion.overallVibe,
          systemPrompt: companion.systemPrompt ?? "",
          avatarUrl: companion.avatarUrl,
        }}
        conversation={{ id: conversation.id }}
        initialMessages={messages.map((m) => {
          // Pull referenceSource from the linked MediaGeneration metadata when
          // available so the bubble's source badge survives a page reload.
          const md = (m.metadata ?? {}) as Record<string, unknown>;
          const refSource = typeof md.referenceSource === "string"
            ? (md.referenceSource as "user-attachment" | "last-companion-photo" | "user+companion" | "none")
            : undefined;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            mediaUrl: m.mediaUrl ?? undefined,
            mediaType: (m.mediaType as "image" | "video" | undefined) ?? undefined,
            referenceSource: refSource,
          };
        })}
        memory={memory?.memoryMarkdown ?? ""}
        credits={credits}
        creditCostPerMessage={creditCost}
      />
    </div>
  );
}
