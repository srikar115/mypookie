import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildDefaultMemory } from "@/lib/ai/promptBuilder";
import { buildSystemPrompt } from "@/lib/ai/promptBuilder";
import { routeChat } from "@/lib/ai/providerRouter";

const bodySchema = z.object({
  /** soft = archive conversation, keep memory intact */
  mode: z.enum(["soft", "hard"]).default("soft"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { conversationId } = await params;

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { companion: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let mode: "soft" | "hard" = "soft";
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (parsed.success) mode = parsed.data.mode;
  } catch { /* body optional */ }

  // Archive current conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "ARCHIVED" },
  });

  // Hard reset: wipe memory back to default
  if (mode === "hard") {
    const defaultMemory = buildDefaultMemory(conversation.companion);
    await prisma.companionMemory.upsert({
      where: { companionId: conversation.companionId },
      update: { memoryMarkdown: defaultMemory, version: 1 },
      create: {
        companionId: conversation.companionId,
        userId,
        memoryMarkdown: defaultMemory,
        version: 1,
      },
    });
  }

  // Create fresh conversation
  const newConversation = await prisma.conversation.create({
    data: {
      userId,
      companionId: conversation.companionId,
      title: `Chat with ${conversation.companion.name}`,
    },
  });

  // Generate a new greeting
  const systemPrompt = buildSystemPrompt(conversation.companion);
  let greetingContent = `Hey, it's great to see you! What's on your mind?`;
  try {
    const greeting = await routeChat({
      messages: [],
      systemPrompt: `${systemPrompt}\n\nGenerate a short, warm, in-character greeting for a fresh conversation. 1-2 sentences. No explicit content.`,
    });
    greetingContent = greeting.content;
  } catch { /* use default */ }

  const greetingMessage = await prisma.message.create({
    data: {
      conversationId: newConversation.id,
      role: "ASSISTANT",
      content: greetingContent,
      modelSlug: "mock-chat-v1",
    },
  });

  return NextResponse.json({
    conversationId: newConversation.id,
    companionId: conversation.companionId,
    greeting: {
      id: greetingMessage.id,
      content: greetingContent,
      role: "ASSISTANT",
      createdAt: greetingMessage.createdAt,
    },
  });
}
