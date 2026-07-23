import prisma from "@/lib/db";

export type ActionType = "chat_message" | "image_generate" | "video_generate_5s" | "video_generate_8s" | "video_generate_10s" | string;

const DEFAULT_COSTS: Record<string, number> = {
  chat_message: 1,
  image_generate: 10,
  video_generate_5s: 30,
  video_generate_8s: 45,
  video_generate_10s: 60,
};

export async function getCreditCost(
  actionType: ActionType,
  modelSlug?: string,
  planSlug?: string
): Promise<number> {
  // Most specific rule first: action + model + plan
  if (modelSlug && planSlug) {
    const rule = await prisma.pricingRule.findFirst({
      where: { actionType, modelSlug, planSlug, isEnabled: true },
    });
    if (rule) return rule.creditCost;
  }

  // action + model
  if (modelSlug) {
    const rule = await prisma.pricingRule.findFirst({
      where: { actionType, modelSlug, planSlug: null, isEnabled: true },
    });
    if (rule) return rule.creditCost;
  }

  // action + plan
  if (planSlug) {
    const rule = await prisma.pricingRule.findFirst({
      where: { actionType, modelSlug: null, planSlug, isEnabled: true },
    });
    if (rule) return rule.creditCost;
  }

  // Generic: action only
  const rule = await prisma.pricingRule.findFirst({
    where: { actionType, modelSlug: null, planSlug: null, isEnabled: true },
  });
  if (rule) return rule.creditCost;

  return DEFAULT_COSTS[actionType] ?? 1;
}

export async function getVideoCreditCost(durationSeconds: number, modelSlug?: string): Promise<number> {
  const actionKey = `video_generate_${durationSeconds}s` as ActionType;
  const cost = await getCreditCost(actionKey, modelSlug);
  if (cost !== (DEFAULT_COSTS[actionKey] ?? 60)) return cost;
  // Fallback: base video cost + per-second rate
  const baseCost = await getCreditCost("video_generate", modelSlug);
  return baseCost + durationSeconds * 3;
}

export async function estimateCreditCost(
  type: "image" | "video",
  options: { modelSlug?: string; durationSeconds?: number; planSlug?: string }
): Promise<number> {
  if (type === "image") {
    return getCreditCost("image_generate", options.modelSlug, options.planSlug);
  }
  return getVideoCreditCost(options.durationSeconds ?? 5, options.modelSlug);
}

export async function getAllPricingRules() {
  return prisma.pricingRule.findMany({
    orderBy: [{ actionType: "asc" }, { modelSlug: "asc" }],
  });
}

export async function getActivePlans() {
  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getPlanBySlug(slug: string) {
  return prisma.plan.findUnique({ where: { slug } });
}

export async function getActiveCreditPacks() {
  return prisma.creditPack.findMany({
    where: { isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });
}
