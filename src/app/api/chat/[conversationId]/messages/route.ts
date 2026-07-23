import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { routeChat } from "@/lib/ai/providerRouter";
import { deductCredits } from "@/lib/billing/creditService";
import { getCreditCost } from "@/lib/billing/pricingService";
import { moderateContent } from "@/lib/ai/moderationService";
import { buildSystemPrompt } from "@/lib/ai/promptBuilder";
import { getMemory } from "@/lib/memory/memoryService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id as string;
  const { conversationId } = await params;

  try {
    // Validate conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { companion: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { content } = await req.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
    }

    // Moderate user input
    const modResult = await moderateContent(content, {
      userId,
      contentType: "chat_message",
    });

    if (!modResult.allowed) {
      return NextResponse.json(
        { error: "Message blocked by content moderation." },
        { status: 422 }
      );
    }

    // Check and deduct credits
    const creditCost = await getCreditCost("chat_message");

    const deduction = await deductCredits(
      userId,
      creditCost,
      `Chat message — ${conversation.companion.name}`,
      conversationId
    );

    if (!deduction.success) {
      return NextResponse.json(
        { error: "Insufficient credits.", creditsRemaining: deduction.balance },
        { status: 402 }
      );
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "USER",
        content: content.trim(),
        creditsUsed: creditCost,
      },
    });

    // Load recent conversation history (last 20 messages)
    const recentMessages = await prisma.message.findMany({
      where: {
        conversationId,
        id: { not: userMessage.id },
        role: { in: ["USER", "ASSISTANT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const historyMessages = recentMessages.reverse().map((m) => ({
      role: m.role.toLowerCase() as "user" | "assistant",
      content: m.content,
    }));

    // Load memory
    const memory = await getMemory(conversation.companionId, userId);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      conversation.companion,
      memory?.memoryMarkdown
    );

    // Route to AI provider
    const aiResponse = await routeChat({
      messages: [
        ...historyMessages,
        { role: "user", content: content.trim() },
      ],
      systemPrompt,
    });

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: aiResponse.content,
        modelSlug: aiResponse.modelSlug,
        creditsUsed: 0,
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      userMessage,
      assistantMessage,
      creditsRemaining: deduction.balance,
    });
  } catch (error) {
    console.error("[CHAT MESSAGES]", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
