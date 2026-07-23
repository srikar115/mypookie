import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateCompanionAvatar } from "@/lib/companions/companionService";
import { z } from "zod";

const bodySchema = z.object({
  customPrompt: z.string().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;

  const companion = await prisma.companion.findFirst({
    where: { id, userId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!companion) {
    return NextResponse.json({ error: "Companion not found" }, { status: 404 });
  }

  let customPrompt: string | undefined;
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (parsed.success) customPrompt = parsed.data.customPrompt;
  } catch { /* body is optional */ }

  // Reset avatarUrl so a fresh one is generated
  await prisma.companion.update({
    where: { id },
    data: { avatarUrl: null },
  });

  // Fire and forget
  generateCompanionAvatar(id, customPrompt).catch(console.error);

  return NextResponse.json({ status: "generating" });
}

/** Poll endpoint: returns current avatarUrl (null while generating) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const companion = await prisma.companion.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true, avatarUrl: true },
  });

  if (!companion) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ avatarUrl: companion.avatarUrl, name: companion.name });
}
