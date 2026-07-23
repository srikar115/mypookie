import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  monthlyPrice: z.number().min(0).optional(),
  yearlyPrice: z.number().min(0).optional(),
  monthlyCredits: z.number().min(0).optional(),
  companionLimit: z.number().min(1).optional(),
  features: z.array(z.string()).optional(),
  modelTier: z.string().optional(),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const plan = await prisma.plan.update({ where: { id }, data: parsed.data });
  await logAdminAction(session!.user!.id!, "UPDATE_PLAN", "plan", id, {});
  return NextResponse.json(plan);
}
