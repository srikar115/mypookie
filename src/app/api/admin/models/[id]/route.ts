import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";
import { ModelType, Prisma } from "@prisma/client";

const schema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  providerId: z.string().uuid().optional(),
  modelType: z.nativeEnum(ModelType).optional(),
  externalModelId: z.string().optional(),
  creditCostPerCall: z.number().min(0).optional(),
  supportsStreaming: z.boolean().optional(),
  supportsAsync: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  safetyTier: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const { providerId, capabilities, inputSchema, outputSchema, settings, ...rest } = parsed.data;

  const model = await prisma.aiModel.update({
    where: { id },
    data: {
      ...rest,
      ...(providerId !== undefined ? { provider: { connect: { id: providerId } } } : {}),
      ...(capabilities !== undefined ? { capabilities: capabilities as Prisma.InputJsonValue } : {}),
      ...(inputSchema !== undefined ? { inputSchema: inputSchema as Prisma.InputJsonValue } : {}),
      ...(outputSchema !== undefined ? { outputSchema: outputSchema as Prisma.InputJsonValue } : {}),
      ...(settings !== undefined ? { settings: settings as Prisma.InputJsonValue } : {}),
    },
  });
  await logAdminAction(session!.user!.id!, "UPDATE_MODEL", "ai_model", id, {});
  return NextResponse.json(model);
}
