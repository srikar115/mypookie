import prisma from "@/lib/db";
import { ModelType } from "@prisma/client";

export async function getDefaultModel(modelType: ModelType) {
  const defaultEntry = await prisma.modelDefault.findUnique({
    where: { modelType },
    include: { model: { include: { provider: true } } },
  });

  return defaultEntry?.model ?? null;
}

export async function getModelBySlug(slug: string) {
  return prisma.aiModel.findUnique({
    where: { slug },
    include: { provider: true },
  });
}

export async function getEnabledModels(modelType?: ModelType) {
  return prisma.aiModel.findMany({
    where: {
      isEnabled: true,
      ...(modelType ? { modelType } : {}),
    },
    include: { provider: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Finds the first enabled model whose `capabilities` JSON has the given flag
 * set to true. Used to look up image-edit / image-to-video variants without
 * requiring a new ModelType enum value.
 */
export async function getModelByCapability(
  modelType: ModelType,
  capabilityFlag: string
) {
  const models = await prisma.aiModel.findMany({
    where: { isEnabled: true, modelType },
    include: { provider: true },
  });
  return (
    models.find((m) => {
      const caps = m.capabilities as Record<string, unknown> | null;
      return caps?.[capabilityFlag] === true;
    }) ?? null
  );
}

export async function setDefaultModel(
  modelType: ModelType,
  modelId: string,
  adminId: string
) {
  const model = await prisma.aiModel.findUnique({ where: { id: modelId } });
  if (!model || model.modelType !== modelType) {
    throw new Error("Model not found or type mismatch");
  }

  return prisma.modelDefault.upsert({
    where: { modelType },
    update: { modelId, setBy: adminId },
    create: { modelType, modelId, setBy: adminId },
  });
}
