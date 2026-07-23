import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

const schema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  credits: z.number().min(1).optional(),
  bonusCredits: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().optional(),
  stripePriceId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  const pack = await prisma.creditPack.update({ where: { id }, data: parsed.data });
  await logAdminAction(session!.user!.id!, "UPDATE_CREDIT_PACK", "credit_pack", id, {});
  return NextResponse.json(pack);
}
