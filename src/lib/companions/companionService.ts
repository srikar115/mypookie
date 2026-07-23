import prisma from "@/lib/db";
import { buildSystemPrompt, buildAppearancePrompt, buildDefaultMemory } from "@/lib/ai/promptBuilder";
import { routeChat, generateImage, getCompanionSeed } from "@/lib/ai/providerRouter";
import { Prisma } from "@prisma/client";
import type { Companion } from "@prisma/client";

export interface CompanionCreateInput {
  userId: string;
  name: string;
  companionType: string;
  genderPresentation: string;
  ageStyle: string;
  relationshipStyle: string;
  greetingStyle: string;
  personalityPreset?: string | null;
  personalityTraits?: Record<string, number>;
  visualStyle: string;
  hairColor: string;
  hairstyle: string;
  eyeColor: string;
  buildStyle: string;
  fashionStyle: string;
  overallVibe: string;
  customAppearanceNotes?: string | null;
  conversationTone: string;
  intimacyLevel: string;
  memoryPreferences?: string[];
  /**
   * Defaults that seed every new conversation's media settings (autoPics,
   * aspect ratio, video source). Stored on Companion.metadata so the
   * preferences survive even if conversations are deleted.
   */
  defaultMediaSettings?: {
    autoPics?: "off" | "ask" | "on";
    autoVideos?: "off" | "ask" | "on";
    defaultImageAspect?: "portrait" | "square" | "landscape";
    defaultVideoAspect?: "portrait" | "square" | "landscape";
    defaultVideoDuration?: 5 | 8 | 10;
    defaultVideoMode?: "from-last-photo" | "text-only";
  };
}

export async function createCompanion(data: CompanionCreateInput) {
  const metadata: Record<string, unknown> = {};
  if (data.defaultMediaSettings) {
    metadata.defaultMediaSettings = data.defaultMediaSettings;
  }

  const companion = await prisma.companion.create({
    data: {
      userId: data.userId,
      name: data.name,
      companionType: data.companionType,
      genderPresentation: data.genderPresentation,
      ageStyle: data.ageStyle,
      relationshipStyle: data.relationshipStyle,
      greetingStyle: data.greetingStyle,
      personalityPreset: data.personalityPreset ?? null,
      personalityTraits: data.personalityTraits ?? {},
      visualStyle: data.visualStyle,
      hairColor: data.hairColor,
      hairstyle: data.hairstyle,
      eyeColor: data.eyeColor,
      buildStyle: data.buildStyle,
      fashionStyle: data.fashionStyle,
      overallVibe: data.overallVibe,
      customAppearanceNotes: data.customAppearanceNotes ?? null,
      conversationTone: data.conversationTone,
      intimacyLevel: data.intimacyLevel,
      memoryPreferences: data.memoryPreferences ?? [],
      status: "ACTIVE",
      ...(Object.keys(metadata).length
        ? { metadata: metadata as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Generate prompts
  const systemPrompt = buildSystemPrompt(companion);
  const appearancePrompt = buildAppearancePrompt(companion);
  const defaultMemory = buildDefaultMemory(companion);

  // Update with generated prompts
  const updatedCompanion = await prisma.companion.update({
    where: { id: companion.id },
    data: { systemPrompt, appearancePrompt },
  });

  // Create default memory
  await prisma.companionMemory.create({
    data: {
      companionId: companion.id,
      userId: companion.userId,
      memoryMarkdown: defaultMemory,
      version: 1,
    },
  });

  // Create default conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: companion.userId,
      companionId: companion.id,
      title: `Chat with ${companion.name}`,
    },
  });

  // Generate first greeting message
  let greetingContent = `Hi! I'm ${companion.name}. I'm so glad you're here. What's on your mind?`;

  try {
    const greetingResponse = await routeChat({
      messages: [],
      systemPrompt: `${systemPrompt}\n\nGenerate a warm, in-character first greeting message for a new user. 2-3 sentences. Friendly and inviting. No explicit content.`,
    });
    greetingContent = greetingResponse.content;
  } catch {
    // Use default greeting on error
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: greetingContent,
      modelSlug: "mock-chat-v1",
    },
  });

  return { companion: updatedCompanion, conversation };
}

/** Fire-and-forget: generate a portrait avatar for the companion and save to avatarUrl. */
export async function generateCompanionAvatar(
  companionId: string,
  customPrompt?: string
): Promise<void> {
  const companion = await prisma.companion.findUnique({ where: { id: companionId } });
  if (!companion) return;

  const appearancePrompt = buildAppearancePrompt(companion);

  // Style-aware scene: realistic companions get warm cinematic lighting;
  // illustrated/anime companions get a vivid atmospheric backdrop.
  const isRealistic = /real|photo/i.test(companion.visualStyle ?? "");
  const framing =
    "head-and-shoulders portrait, centered composition, full face visible, " +
    "direct gaze, gentle smile, eyes engaging the viewer";
  const defaultScene = isRealistic
    ? "elegant blurred indoor setting, warm ambient light, golden hour tones, soft rim light"
    : "soft gradient background, dreamy lighting, vibrant atmospheric colors";
  const scene = customPrompt?.trim() ? customPrompt.trim() : defaultScene;

  const prompt = [appearancePrompt, framing, scene].filter(Boolean).join(", ");
  const seed = getCompanionSeed(companionId);

  try {
    const result = await generateImage({ prompt, aspectRatio: "portrait", seed });
    await prisma.companion.update({
      where: { id: companionId },
      data: { avatarUrl: result.url },
    });
  } catch (err) {
    console.error(`[generateCompanionAvatar] companion=${companionId}`, err);
  }
}

export async function getCompanionsByUser(userId: string) {
  return prisma.companion.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { memory: { select: { version: true, updatedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCompanionById(id: string, userId: string) {
  return prisma.companion.findFirst({
    where: { id, userId },
    include: { memory: true },
  });
}

export async function updateCompanion(
  id: string,
  userId: string,
  data: Record<string, unknown>
) {
  const companion = await prisma.companion.findFirst({ where: { id, userId } });
  if (!companion) throw new Error("Companion not found");

  const updated = await prisma.companion.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  });

  // Regenerate prompts if core fields changed
  const rebuildFields: (keyof Companion)[] = [
    "name",
    "companionType",
    "genderPresentation",
    "personalityTraits",
    "conversationTone",
    "intimacyLevel",
    "relationshipStyle",
  ];

  const needsRebuild = rebuildFields.some((f) => f in data);
  if (needsRebuild) {
    const systemPrompt = buildSystemPrompt(updated);
    const appearancePrompt = buildAppearancePrompt(updated);
    await prisma.companion.update({
      where: { id },
      data: { systemPrompt, appearancePrompt },
    });
  }

  return updated;
}

export async function archiveCompanion(id: string, userId: string) {
  const companion = await prisma.companion.findFirst({ where: { id, userId } });
  if (!companion) throw new Error("Companion not found");

  return prisma.companion.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}
