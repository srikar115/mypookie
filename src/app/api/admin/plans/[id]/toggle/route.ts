import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.plan.update({ where: { id }, data: { isActive: !plan.isActive } });
  await logAdminAction(session!.user!.id!, updated.isActive ? "ENABLE_PLAN" : "DISABLE_PLAN", "plan", id, {});
  return NextResponse.json({ isActive: updated.isActive });
}
