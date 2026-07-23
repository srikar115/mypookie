import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";
import { ModelType, Prisma } from "@prisma/client";

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  providerId: z.string().uuid(),
  modelType: z.nativeEnum(ModelType),
  externalModelId: z.string().optional(),
  creditCostPerCall: z.number().min(0).default(1),
  supportsStreaming: z.boolean().default(false),
  supportsAsync: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  safetyTier: z.string().default("standard"),
  description: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });

  const existing = await prisma.aiModel.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return NextResponse.json({ error: "Slug already exists" }, { status: 409 });

  const { providerId, capabilities, inputSchema, outputSchema, settings, externalModelId, ...rest } = parsed.data;

  const model = await prisma.aiModel.create({
    data: {
      ...rest,
      externalModelId: externalModelId ?? "",
      provider: { connect: { id: providerId } },
      ...(capabilities !== undefined ? { capabilities: capabilities as Prisma.InputJsonValue } : {}),
      ...(inputSchema !== undefined ? { inputSchema: inputSchema as Prisma.InputJsonValue } : {}),
      ...(outputSchema !== undefined ? { outputSchema: outputSchema as Prisma.InputJsonValue } : {}),
      ...(settings !== undefined ? { settings: settings as Prisma.InputJsonValue } : {}),
    },
  });
  await logAdminAction(session!.user!.id!, "CREATE_MODEL", "ai_model", model.id, {});
  return NextResponse.json(model, { status: 201 });
}
