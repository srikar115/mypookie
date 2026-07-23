import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const pack = await prisma.creditPack.findUnique({ where: { id } });
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.creditPack.update({ where: { id }, data: { isEnabled: !pack.isEnabled } });
  await logAdminAction(session!.user!.id!, updated.isEnabled ? "ENABLE_CREDIT_PACK" : "DISABLE_CREDIT_PACK", "credit_pack", id, {});
  return NextResponse.json({ isEnabled: updated.isEnabled });
}
