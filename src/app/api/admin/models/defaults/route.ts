import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setDefaultModel } from "@/lib/ai/modelRegistry";
import { logAdminAction } from "@/lib/admin/auditLogService";
import { ModelType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { modelType, modelId } = await req.json();

  if (!modelType || !modelId) {
    return NextResponse.json({ error: "modelType and modelId required" }, { status: 400 });
  }

  if (!Object.values(ModelType).includes(modelType)) {
    return NextResponse.json({ error: "Invalid model type" }, { status: 400 });
  }

  const adminId = session.user.id as string;

  await setDefaultModel(modelType as ModelType, modelId, adminId);
  await logAdminAction(adminId, "SET_DEFAULT_MODEL", "AiModel", modelId, {
    modelType,
  });

  return NextResponse.json({ success: true });
}
