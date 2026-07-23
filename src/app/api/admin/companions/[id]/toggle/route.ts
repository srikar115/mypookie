import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

/** POST /api/admin/companions/[id]/toggle — flip isPublic or status */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const adminId = session.user.id as string;
  const { field } = await req.json() as { field?: "isPublic" | "status" };

  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let update: Record<string, unknown>;
  if (field === "status") {
    update = { status: companion.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" };
  } else {
    update = { isPublic: !companion.isPublic };
  }

  await prisma.companion.update({ where: { id }, data: update });
  await logAdminAction(adminId, "COMPANION_TOGGLED", "Companion", id, update);

  return NextResponse.json({ success: true, ...update });
}
