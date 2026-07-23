import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSystemPrompt, buildAppearancePrompt } from "@/lib/ai/promptBuilder";
import { logAdminAction } from "@/lib/admin/auditLogService";

// ─── GET /api/admin/companions/[id] ───────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ companion });
}

// ─── PATCH /api/admin/companions/[id] ─────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  companionType: z.string().optional(),
  genderPresentation: z.string().optional(),
  ageStyle: z.string().optional(),
  relationshipStyle: z.string().optional(),
  greetingStyle: z.string().optional(),
  personalityPreset: z.string().optional(),
  personalityTraits: z.record(z.string(), z.number()).optional(),
  visualStyle: z.string().optional(),
  hairColor: z.string().optional(),
  hairstyle: z.string().optional(),
  eyeColor: z.string().optional(),
  buildStyle: z.string().optional(),
  fashionStyle: z.string().optional(),
  overallVibe: z.string().optional(),
  customAppearanceNotes: z.string().optional(),
  conversationTone: z.string().optional(),
  intimacyLevel: z.string().optional(),
  memoryPreferences: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const adminId = session.user.id as string;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await prisma.companion.update({ where: { id }, data: parsed.data as any });

  const rebuildTriggers = ["name","companionType","genderPresentation","personalityTraits","visualStyle","hairColor","hairstyle","eyeColor","buildStyle","fashionStyle","overallVibe","conversationTone","intimacyLevel","relationshipStyle"];
  if (rebuildTriggers.some((f) => f in parsed.data)) {
    const systemPrompt = buildSystemPrompt(updated);
    const appearancePrompt = buildAppearancePrompt(updated);
    await prisma.companion.update({ where: { id }, data: { systemPrompt, appearancePrompt } });
  }

  await logAdminAction(adminId, "COMPANION_UPDATED", "Companion", id, parsed.data);

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/admin/companions/[id] ────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const adminId = session.user.id as string;

  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!companion.isPublic) {
    return NextResponse.json({ error: "Cannot delete user-owned companions from admin panel" }, { status: 400 });
  }

  await prisma.companion.update({ where: { id }, data: { status: "ARCHIVED", isPublic: false } });
  await logAdminAction(adminId, "COMPANION_DELETED", "Companion", id, { name: companion.name });

  return NextResponse.json({ success: true });
}
