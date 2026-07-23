import prisma from "@/lib/db";
import { AdminPlansClient } from "./AdminPlansClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Plans" };

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Membership Plans</h1>
          <p className="text-sm text-gray-400 mt-1">Manage plans, credits, limits, and features</p>
        </div>
      </div>
      <AdminPlansClient plans={plans.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description ?? "",
        monthlyPrice: p.monthlyPrice,
        yearlyPrice: p.yearlyPrice,
        monthlyCredits: p.monthlyCredits,
        companionLimit: p.companionLimit,
        memoryLimitTokens: p.memoryLimitTokens,
        features: (p.features as string[]) ?? [],
        modelTier: p.modelTier,
        isActive: p.isActive,
        sortOrder: p.sortOrder,
        stripePriceIdMonthly: p.stripePriceIdMonthly ?? "",
        stripePriceIdYearly: p.stripePriceIdYearly ?? "",
      }))} />
    </div>
  );
}
