"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Coins,
  Zap,
  Star,
  Crown,
  CheckCircle2,
  ArrowUpCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Loader2,
  Sparkles,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyCredits: number;
  companionLimit: number;
  memoryLimitTokens: number;
  features: string[];
  modelTier: string;
  isActive: boolean;
  sortOrder: number;
  hasMonthlyPrice: boolean;
  hasYearlyPrice: boolean;
}

interface CreditPack {
  id: string;
  name: string;
  slug: string;
  description: string;
  credits: number;
  bonusCredits: number;
  price: number;
  currency: string;
  hasStripePrice: boolean;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

interface CurrentPlan {
  name: string;
  slug: string;
  status: string;
  monthlyCredits: number;
  currentPeriodEnd: string | null;
}

interface Props {
  balance: number;
  plans: Plan[];
  creditPacks: CreditPack[];
  transactions: Transaction[];
  currentPlan: CurrentPlan | null;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Coins className="w-5 h-5" />,
  starter: <Zap className="w-5 h-5" />,
  pro: <Star className="w-5 h-5" />,
  elite: <Crown className="w-5 h-5" />,
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-gray-500/30 bg-gray-500/5",
  starter: "border-blue-500/30 bg-blue-500/5",
  pro: "border-purple-500/30 bg-purple-500/10",
  elite: "border-amber-500/30 bg-amber-500/5",
};

const PLAN_ACCENT: Record<string, string> = {
  free: "text-gray-400",
  starter: "text-blue-400",
  pro: "text-purple-400",
  elite: "text-amber-400",
};

function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

export function BillingClient({ balance, plans, creditPacks, transactions, currentPlan }: Props) {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handlePlanCheckout = async (planSlug: string) => {
    setCheckoutLoading(planSlug);
    try {
      const res = await fetch("/api/billing/create-subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, interval: billingInterval }),
      });
      const data = (await res.json()) as { url?: string; mock?: boolean; message?: string; error?: string };
      if (data.mock) {
        showToast("Stripe not configured — payment disabled in development.", "error");
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error ?? "Checkout failed", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePackCheckout = async (packSlug: string) => {
    setCheckoutLoading(`pack_${packSlug}`);
    try {
      const res = await fetch("/api/billing/create-credit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packSlug }),
      });
      const data = (await res.json()) as { url?: string; mock?: boolean; message?: string; error?: string };
      if (data.mock) {
        showToast("Stripe not configured — payment disabled in development.", "error");
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error ?? "Checkout failed", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Toast */}
      {toast && (
        <div className={cn("fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium", toast.type === "success" ? "bg-green-500/10 border-green-500/20 text-green-300" : "bg-red-500/10 border-red-500/20 text-red-300")}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your plan, credits, and payment history</p>
      </div>

      {/* Current status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Balance */}
        <div className="bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/20 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-400">Credit Balance</span>
          </div>
          <p className="text-3xl font-bold text-white">{balance.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Available credits</p>
        </div>

        {/* Plan */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Current Plan</span>
          </div>
          <p className="text-xl font-bold text-white">{currentPlan?.name ?? "Free"}</p>
          {currentPlan ? (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border mt-1 inline-block", currentPlan.status === "ACTIVE" ? "text-green-400 border-green-500/25 bg-green-500/10" : "text-amber-400 border-amber-500/25 bg-amber-500/10")}>
              {currentPlan.status}
            </span>
          ) : (
            <span className="text-xs text-gray-500">No active subscription</span>
          )}
        </div>

        {/* Renewal */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              {currentPlan ? "Renews" : "Monthly Credits"}
            </span>
          </div>
          {currentPlan?.currentPeriodEnd ? (
            <p className="text-xl font-bold text-white">{formatDate(currentPlan.currentPeriodEnd)}</p>
          ) : (
            <p className="text-xl font-bold text-white">{currentPlan?.monthlyCredits ?? 0}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {currentPlan?.currentPeriodEnd ? "Next billing date" : "Credits per month"}
          </p>
        </div>
      </div>

      {/* Membership Plans */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Membership Plans</h2>
          {/* Billing toggle */}
          <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            {(["monthly", "yearly"] as const).map((interval) => (
              <button
                key={interval}
                onClick={() => setBillingInterval(interval)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-all",
                  billingInterval === interval ? "bg-purple-500 text-white" : "text-gray-400 hover:text-white"
                )}
              >
                {interval === "monthly" ? "Monthly" : "Yearly"}
                {interval === "yearly" && <span className="ml-1 text-green-400">-20%</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.slug === plan.slug;
            const price = billingInterval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
            const accent = PLAN_ACCENT[plan.slug] ?? "text-purple-400";
            const colorClass = PLAN_COLORS[plan.slug] ?? "border-white/10 bg-white/5";
            const icon = PLAN_ICONS[plan.slug] ?? <Sparkles className="w-5 h-5" />;
            const isLoading = checkoutLoading === plan.slug;

            return (
              <div
                key={plan.id}
                className={cn("rounded-2xl border p-5 flex flex-col gap-4 transition-all", colorClass, isCurrent && "ring-2 ring-purple-500/50")}
              >
                <div>
                  <div className={cn("inline-flex items-center gap-1.5 mb-2", accent)}>
                    {icon}
                    <span className="font-semibold">{plan.name}</span>
                  </div>
                  {price > 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">{formatCents(price)}</span>
                      <span className="text-xs text-gray-500">/{billingInterval === "monthly" ? "mo" : "yr"}</span>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-white">Free</p>
                  )}
                  {plan.monthlyCredits > 0 && (
                    <p className="text-xs text-gray-500 mt-1">{plan.monthlyCredits.toLocaleString()} credits/month</p>
                  )}
                </div>

                <ul className="flex-1 space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-gray-300">
                    <CheckCircle2 className={cn("w-3.5 h-3.5 shrink-0", accent)} />
                    {plan.companionLimit} companion{plan.companionLimit !== 1 ? "s" : ""}
                  </li>
                  {plan.features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                      <CheckCircle2 className={cn("w-3.5 h-3.5 shrink-0", accent)} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrent && handlePlanCheckout(plan.slug)}
                  disabled={isCurrent || isLoading || (!plan.hasMonthlyPrice && !plan.hasYearlyPrice && price > 0)}
                  className={cn(
                    "w-full py-2 rounded-xl text-sm font-semibold transition-all",
                    isCurrent
                      ? "bg-purple-500/20 text-purple-300 cursor-default"
                      : price > 0 && !plan.hasMonthlyPrice
                      ? "bg-white/5 text-gray-600 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90"
                  )}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isCurrent ? "Current Plan" : price === 0 ? "Free Plan" : "Upgrade"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Credit Packs */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Pay-As-You-Go Credits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {creditPacks.map((pack) => {
            const isLoading = checkoutLoading === `pack_${pack.slug}`;
            const total = pack.credits + pack.bonusCredits;
            return (
              <div key={pack.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 hover:border-white/20 transition-all">
                <div>
                  <p className="font-semibold text-white">{pack.name}</p>
                  {pack.description && <p className="text-xs text-gray-500 mt-0.5">{pack.description}</p>}
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-2xl font-bold text-white">{pack.credits.toLocaleString()}</span>
                    <span className="text-xs text-gray-500">credits</span>
                  </div>
                  {pack.bonusCredits > 0 && (
                    <p className="text-xs text-green-400 mt-0.5">+{pack.bonusCredits} bonus = {total} total</p>
                  )}
                  <p className="text-sm font-semibold text-purple-300 mt-1">{formatCents(pack.price, pack.currency)}</p>
                </div>

                <button
                  onClick={() => handlePackCheckout(pack.slug)}
                  disabled={isLoading || !pack.hasStripePrice}
                  className={cn(
                    "w-full py-2 rounded-xl text-sm font-semibold transition-all",
                    !pack.hasStripePrice
                      ? "bg-white/5 text-gray-600 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 disabled:opacity-50"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : !pack.hasStripePrice ? (
                    "Coming Soon"
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 inline mr-1" />
                      Buy Credits
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Credits never expire. Pay-as-you-go packs add to your balance immediately after payment.
        </p>
      </section>

      {/* Transaction History */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">No transactions yet.</div>
        ) : (
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Description</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Amount</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium hidden sm:table-cell">Balance</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-300">{tx.description}</p>
                      <p className="text-xs text-gray-600 sm:hidden mt-0.5">{formatDate(tx.createdAt)}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn("text-sm font-semibold flex items-center justify-end gap-1", tx.amount > 0 ? "text-green-400" : "text-red-400")}>
                        {tx.amount > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right hidden sm:table-cell">
                      <span className="text-sm text-gray-400">{tx.balanceAfter.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-3 text-right hidden sm:table-cell">
                      <span className="text-xs text-gray-500">{formatDate(tx.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Link href="/app/billing/history" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
            View full history →
          </Link>
        </div>
      </section>

      {/* Cancel subscription */}
      {currentPlan && (
        <section className="p-5 rounded-2xl border border-red-500/15 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-300">Cancel Subscription</p>
              <p className="text-sm text-gray-400 mt-1">
                Your plan will remain active until the end of the billing period.
                Contact support or manage your subscription in Stripe to cancel.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
