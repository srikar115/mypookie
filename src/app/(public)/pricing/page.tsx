import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Crown } from "lucide-react";

const plans = [
  {
    name: "Free Trial",
    slug: "trial",
    price: 0,
    period: "one-time",
    description: "Try Honey Bunny with free credits. No card required.",
    credits: 100,
    icon: Sparkles,
    color: "text-emerald-400",
    border: "border-[#2a2a3d]",
    features: [
      "100 free trial credits",
      "Create 1 companion",
      "Chat with your companion",
      "Basic memory",
      "Access to core features",
    ],
    cta: "Start Free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Starter",
    slug: "starter",
    price: 9,
    period: "month",
    description: "For regular users who want a great experience.",
    credits: 500,
    icon: Zap,
    color: "text-purple-400",
    border: "border-purple-500/40",
    features: [
      "500 credits per month",
      "Create up to 3 companions",
      "Full chat features",
      "Full memory system",
      "Priority support",
      "Credit top-ups available",
    ],
    cta: "Get Started",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Premium",
    slug: "premium",
    price: 24,
    period: "month",
    description: "For power users who want the full experience.",
    credits: 2000,
    icon: Crown,
    color: "text-amber-400",
    border: "border-[#2a2a3d]",
    features: [
      "2,000 credits per month",
      "Unlimited companions",
      "All chat features",
      "Advanced memory & editing",
      "Early access to image/video",
      "Priority AI models",
      "Dedicated support",
    ],
    cta: "Go Premium",
    href: "/signup",
    highlight: false,
  },
];

const creditPacks = [
  { credits: 100, price: 2, label: "100 Credits" },
  { credits: 500, price: 8, label: "500 Credits" },
  { credits: 1200, price: 18, label: "1,200 Credits" },
  { credits: 3000, price: 40, label: "3,000 Credits" },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      {/* Header */}
      <section className="py-16 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-bold mb-4">
            Simple, <span className="text-gradient">transparent</span> pricing
          </h1>
          <p className="text-[#9ca3af] text-lg">
            Start free. Pay only for what you use. No hidden fees.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.slug}
                  className={`relative rounded-2xl border ${plan.border} bg-[#12121a] p-8 flex flex-col ${
                    plan.highlight ? "ring-1 ring-purple-500/50 shadow-lg shadow-purple-500/10" : ""
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a1a26] border border-[#2a2a3d] mb-4`}>
                      <Icon className={`h-5 w-5 ${plan.color}`} />
                    </div>
                    <h3 className="text-xl font-bold text-[#f1f0ff] mb-1">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-[#6b7280]">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-[#f1f0ff]">
                        ${plan.price}
                      </span>
                      {plan.price > 0 && (
                        <span className="text-[#6b7280] text-sm">/{plan.period}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#9ca3af] mt-1">
                      {plan.credits.toLocaleString()} credits included
                    </p>
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-[#c4c2d4]">
                        <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link href={plan.href}>
                    <Button
                      variant={plan.highlight ? "default" : "secondary"}
                      className="w-full"
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit packs */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Need more credits?</h2>
            <p className="text-[#9ca3af]">
              Top up your wallet anytime with credit packs.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {creditPacks.map((pack) => (
              <div
                key={pack.credits}
                className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-5 text-center hover:border-[#3a3a50] transition-colors"
              >
                <p className="text-2xl font-bold text-[#f1f0ff] mb-1">
                  {pack.credits.toLocaleString()}
                </p>
                <p className="text-xs text-[#6b7280] mb-3">credits</p>
                <p className="text-lg font-semibold text-purple-400">${pack.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How credits work */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-[#2a2a3d] bg-[#12121a] p-8">
            <h3 className="text-xl font-semibold mb-6 text-center">How credits work</h3>
            <div className="grid sm:grid-cols-3 gap-6 text-center">
              {[
                { action: "Chat message", cost: "1 credit" },
                { action: "AI image", cost: "10 credits" },
                { action: "AI video", cost: "Coming soon" },
              ].map((item) => (
                <div key={item.action}>
                  <p className="text-[#f1f0ff] font-medium mb-1">{item.action}</p>
                  <p className="text-sm text-[#9ca3af]">{item.cost}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
