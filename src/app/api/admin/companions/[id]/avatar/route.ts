import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateCompanionAvatar } from "@/lib/companions/companionService";

/** POST /api/admin/companions/[id]/avatar — trigger avatar (re)generation */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const customPrompt: string | undefined = (body as { customPrompt?: string }).customPrompt;

  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.companion.update({ where: { id }, data: { avatarUrl: null } });
  generateCompanionAvatar(id, customPrompt).catch(console.error);

  return NextResponse.json({ status: "generating" });
}

/** GET /api/admin/companions/[id]/avatar — poll generation status */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const companion = await prisma.companion.findUnique({
    where: { id },
    select: { avatarUrl: true, name: true },
  });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ avatarUrl: companion.avatarUrl, name: companion.name });
}
