import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getBalance, getTransactionHistory } from "@/lib/billing/creditService";
import { getActivePlans, getActiveCreditPacks } from "@/lib/billing/pricingService";
import { BillingClient } from "./BillingClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing & Credits" };

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [balance, plans, creditPacks, transactions, subscription] = await Promise.all([
    getBalance(userId),
    getActivePlans(),
    getActiveCreditPacks(),
    getTransactionHistory(userId, 15),
    prisma.subscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <BillingClient
      balance={balance}
      plans={plans.map((p) => ({
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
        hasMonthlyPrice: !!p.stripePriceIdMonthly,
        hasYearlyPrice: !!p.stripePriceIdYearly,
      }))}
      creditPacks={creditPacks.map((cp) => ({
        id: cp.id,
        name: cp.name,
        slug: cp.slug,
        description: cp.description ?? "",
        credits: cp.credits,
        bonusCredits: cp.bonusCredits,
        price: cp.price,
        currency: cp.currency,
        hasStripePrice: !!cp.stripePriceId,
      }))}
      transactions={transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt.toISOString(),
      }))}
      currentPlan={subscription ? {
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        status: subscription.status,
        monthlyCredits: subscription.plan.monthlyCredits,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      } : null}
    />
  );
}
