import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantCredits } from "@/lib/billing/creditService";
import { logAdminAction } from "@/lib/admin/auditLogService";
import { TransactionType } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { amount } = await req.json();
  const adminId = session.user.id as string;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid credit amount" }, { status: 400 });
  }

  await grantCredits(
    id,
    amount,
    `Admin grant by ${session.user.email}`,
    TransactionType.CREDIT_GRANT,
    adminId
  );

  await logAdminAction(adminId, "GRANT_CREDITS", "User", id, { amount });

  return NextResponse.json({ success: true });
}
