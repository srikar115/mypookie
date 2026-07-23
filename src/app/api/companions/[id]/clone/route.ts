import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSystemPrompt, buildAppearancePrompt, buildDefaultMemory } from "@/lib/ai/promptBuilder";
import { routeChat } from "@/lib/ai/providerRouter";

/**
 * POST /api/companions/[id]/clone
 *
 * Clones a public companion template into the authenticated user's account.
 * Reuses the template's avatarUrl so no image generation cost is incurred.
 * Returns { companionId, conversationId } to redirect straight to chat.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id as string;

  const template = await prisma.companion.findUnique({ where: { id } });
  if (!template || !template.isPublic) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Create a new companion owned by the user, cloned from the template
  const companion = await prisma.companion.create({
    data: {
      userId,
      name: template.name,
      companionType: template.companionType ?? "",
      genderPresentation: template.genderPresentation ?? "",
      ageStyle: template.ageStyle ?? "",
      relationshipStyle: template.relationshipStyle ?? "",
      greetingStyle: template.greetingStyle ?? "",
      personalityPreset: template.personalityPreset,
      personalityTraits: template.personalityTraits ?? {},
      visualStyle: template.visualStyle ?? "",
      hairColor: template.hairColor ?? "",
      hairstyle: template.hairstyle ?? "",
      eyeColor: template.eyeColor ?? "",
      buildStyle: template.buildStyle ?? "",
      fashionStyle: template.fashionStyle ?? "",
      overallVibe: template.overallVibe ?? "",
      customAppearanceNotes: template.customAppearanceNotes,
      conversationTone: template.conversationTone ?? "",
      intimacyLevel: template.intimacyLevel ?? "",
      memoryPreferences: (template.memoryPreferences as string[]) ?? [],
      // Reuse template avatar — no re-generation needed
      avatarUrl: template.avatarUrl,
      status: "ACTIVE",
      isPublic: false,
    },
  });

  // Build and persist system + appearance prompts
  const systemPrompt = buildSystemPrompt(companion);
  const appearancePrompt = buildAppearancePrompt(companion);
  const defaultMemory = buildDefaultMemory(companion);

  await prisma.companion.update({
    where: { id: companion.id },
    data: { systemPrompt, appearancePrompt },
  });

  // Create default memory
  await prisma.companionMemory.create({
    data: {
      companionId: companion.id,
      userId,
      memoryMarkdown: defaultMemory,
      version: 1,
    },
  });

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      companionId: companion.id,
      title: `Chat with ${companion.name}`,
    },
  });

  // Generate greeting
  let greetingContent = `Hi! I'm ${companion.name}. I'm so glad you're here. What's on your mind?`;
  try {
    const greetingResponse = await routeChat({
      messages: [],
      systemPrompt: `${systemPrompt}\n\nGenerate a warm, in-character first greeting message for a new user. 2-3 sentences. Friendly and inviting.`,
    });
    greetingContent = greetingResponse.content;
  } catch {
    // Use fallback greeting
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: greetingContent,
      modelSlug: "mock-chat-v1",
    },
  });

  return NextResponse.json({
    companionId: companion.id,
    conversationId: conversation.id,
  });
}
