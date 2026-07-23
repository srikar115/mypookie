import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logAdminAction } from "@/lib/admin/auditLogService";
import { moderateContent } from "@/lib/ai/moderationService";
import {
  adminTestChat,
  adminTestImage,
  adminTestVideo,
  getVideoJobStatus,
} from "@/lib/ai/providerRouter";
import type { AiModel, AiProvider } from "@prisma/client";

type ModelWithProvider = AiModel & { provider: AiProvider };

const testSchema = z.discriminatedUnion("modelType", [
  z.object({
    modelType: z.literal("CHAT"),
    modelId: z.string().uuid(),
    prompt: z.string().min(1).max(1000),
    systemPrompt: z.string().max(2000).optional(),
  }),
  z.object({
    modelType: z.literal("IMAGE"),
    modelId: z.string().uuid(),
    prompt: z.string().min(1).max(500),
    aspectRatio: z.string().default("square"),
  }),
  z.object({
    modelType: z.literal("VIDEO"),
    modelId: z.string().uuid(),
    prompt: z.string().min(1).max(500),
    durationSeconds: z.number().int().min(1).max(30).default(5),
    aspectRatio: z.string().default("square"),
  }),
]);

const pollSchema = z.object({
  jobId: z.string(),
  modelId: z.string().uuid(),
});

async function requireAdmin(req: NextRequest) {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: session!, error: null };
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin(req);
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });
  }

  const data = parsed.data;

  const model = await prisma.aiModel.findUnique({
    where: { id: data.modelId },
    include: { provider: true },
  }) as ModelWithProvider | null;

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  if (model.modelType !== data.modelType) {
    return NextResponse.json({ error: "Model type mismatch" }, { status: 400 });
  }

  // Run moderation on the test prompt (admin tests still go through moderation)
  const modResult = await moderateContent(data.prompt, {
    userId: session.user!.id!,
    contentType: `admin_test_${data.modelType.toLowerCase()}`,
  });

  if (!modResult.allowed) {
    return NextResponse.json({
      error: "Prompt blocked by content moderation.",
      flaggedTerms: modResult.flaggedTerms,
    }, { status: 422 });
  }

  const adminId = session.user!.id!;

  try {
    if (data.modelType === "CHAT") {
      const result = await adminTestChat(model, data.prompt, data.systemPrompt);
      await logAdminAction(adminId, "TEST_MODEL", "ai_model", model.id, {
        modelType: "CHAT",
        modelSlug: model.slug,
        latencyMs: result.latencyMs,
      });
      return NextResponse.json({ success: true, result });
    }

    if (data.modelType === "IMAGE") {
      const result = await adminTestImage(model, data.prompt, data.aspectRatio);
      await logAdminAction(adminId, "TEST_MODEL", "ai_model", model.id, {
        modelType: "IMAGE",
        modelSlug: model.slug,
        latencyMs: result.latencyMs,
      });
      return NextResponse.json({ success: true, result });
    }

    if (data.modelType === "VIDEO") {
      const result = await adminTestVideo(model, data.prompt, data.durationSeconds, data.aspectRatio);
      await logAdminAction(adminId, "TEST_MODEL", "ai_model", model.id, {
        modelType: "VIDEO",
        modelSlug: model.slug,
        latencyMs: result.latencyMs,
        jobId: result.jobId,
      });
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: "Unsupported model type" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAdminAction(adminId, "TEST_MODEL_FAILED", "ai_model", model.id, {
      modelType: data.modelType,
      error: message,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Poll video job status
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const rawBody = { jobId: url.searchParams.get("jobId"), modelId: url.searchParams.get("modelId") };

  const parsed = pollSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "jobId and modelId are required" }, { status: 400 });
  }

  const { jobId, modelId } = parsed.data;

  const model = await prisma.aiModel.findUnique({
    where: { id: modelId },
    include: { provider: true },
  }) as ModelWithProvider | null;

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  try {
    const status = await getVideoJobStatus(jobId, model.provider.slug);
    return NextResponse.json({ success: true, result: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
