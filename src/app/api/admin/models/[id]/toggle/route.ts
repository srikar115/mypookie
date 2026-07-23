import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { isEnabled } = await req.json();
  const adminId = session.user.id as string;

  const model = await prisma.aiModel.update({
    where: { id },
    data: { isEnabled },
  });

  await logAdminAction(adminId, isEnabled ? "ENABLE_MODEL" : "DISABLE_MODEL", "AiModel", id);

  return NextResponse.json({ model });
}
