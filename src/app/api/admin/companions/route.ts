import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSystemPrompt, buildAppearancePrompt, buildDefaultMemory } from "@/lib/ai/promptBuilder";
import { generateCompanionAvatar } from "@/lib/companions/companionService";
import { logAdminAction } from "@/lib/admin/auditLogService";

// ─── GET /api/admin/companions ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const publicOnly = searchParams.get("public") === "true";

  const companions = await prisma.companion.findMany({
    where: publicOnly ? { isPublic: true } : {},
    orderBy: [{ isPublic: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      companionType: true,
      genderPresentation: true,
      ageStyle: true,
      visualStyle: true,
      overallVibe: true,
      personalityPreset: true,
      avatarUrl: true,
      status: true,
      isPublic: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  return NextResponse.json({ companions });
}

// ─── POST /api/admin/companions ────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(60),
  companionType: z.string().min(1),
  genderPresentation: z.string().min(1),
  ageStyle: z.string().min(1),
  relationshipStyle: z.string().min(1),
  greetingStyle: z.string().min(1),
  personalityPreset: z.string().optional().default(""),
  personalityTraits: z.record(z.string(), z.number()).default({}),
  visualStyle: z.string().min(1),
  hairColor: z.string().min(1),
  hairstyle: z.string().min(1),
  eyeColor: z.string().min(1),
  buildStyle: z.string().min(1),
  fashionStyle: z.string().min(1),
  overallVibe: z.string().min(1),
  customAppearanceNotes: z.string().optional().default(""),
  conversationTone: z.string().min(1),
  intimacyLevel: z.string().min(1),
  memoryPreferences: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  generateAvatar: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminId = session.user.id as string;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;

  const systemUser = await prisma.user.upsert({
    where: { email: "system@amorify.app" },
    update: {},
    create: { email: "system@amorify.app", name: "System", role: "ADMIN", status: "ACTIVE" },
  });

  const companion = await prisma.companion.create({
    data: {
      userId: systemUser.id,
      name: d.name,
      companionType: d.companionType,
      genderPresentation: d.genderPresentation,
      ageStyle: d.ageStyle,
      relationshipStyle: d.relationshipStyle,
      greetingStyle: d.greetingStyle,
      personalityPreset: d.personalityPreset || null,
      personalityTraits: d.personalityTraits,
      visualStyle: d.visualStyle,
      hairColor: d.hairColor,
      hairstyle: d.hairstyle,
      eyeColor: d.eyeColor,
      buildStyle: d.buildStyle,
      fashionStyle: d.fashionStyle,
      overallVibe: d.overallVibe,
      customAppearanceNotes: d.customAppearanceNotes || null,
      conversationTone: d.conversationTone,
      intimacyLevel: d.intimacyLevel,
      memoryPreferences: d.memoryPreferences,
      status: "ACTIVE",
      isPublic: d.isPublic,
    },
  });

  const systemPrompt = buildSystemPrompt(companion);
  const appearancePrompt = buildAppearancePrompt(companion);
  const defaultMemory = buildDefaultMemory(companion);

  await prisma.companion.update({ where: { id: companion.id }, data: { systemPrompt, appearancePrompt } });
  await prisma.companionMemory.upsert({
    where: { companionId: companion.id },
    update: {},
    create: { companionId: companion.id, userId: systemUser.id, memoryMarkdown: defaultMemory, version: 1 },
  });

  if (d.generateAvatar) {
    generateCompanionAvatar(companion.id).catch(console.error);
  }

  await logAdminAction(adminId, "COMPANION_CREATED", "Companion", companion.id, { name: d.name, isPublic: d.isPublic });

  return NextResponse.json({ companion }, { status: 201 });
}
