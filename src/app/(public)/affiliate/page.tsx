import type { Metadata } from "next";
import { Users, DollarSign, BarChart3, Palette, Wallet } from "lucide-react";
import { ComingSoon } from "@/components/public/ComingSoon";

export const metadata: Metadata = {
  title: "Affiliate Program \u2014 Amorify",
  description: "Earn recurring commission for every user you bring.",
};

export default function AffiliatePage() {
  return (
    <ComingSoon
      icon={<Users className="h-8 w-8 text-emerald-400" />}
      iconBg="bg-emerald-500/10"
      iconBorder="border-emerald-500/20"
      titlePrefix="Earn with"
      titleAccent="Amorify"
      tagline="Refer users, earn recurring commission on every plan they buy, and track everything in a live dashboard. No caps, no gotchas."
      eta="Applications open in 2026"
      features={[
        {
          icon: <DollarSign className="h-5 w-5 text-emerald-400" />,
          title: "Recurring commission",
          description:
            "Earn a percentage of every subscription payment your referrals make \u2014 for as long as they stay. Not just a one-time bounty.",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
        },
        {
          icon: <BarChart3 className="h-5 w-5 text-blue-400" />,
          title: "Live dashboard",
          description:
            "Clicks, signups, conversions, and payouts \u2014 tracked in real time. Break down performance by campaign, link, or time period.",
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
        },
        {
          icon: <Palette className="h-5 w-5 text-purple-400" />,
          title: "Marketing kit",
          description:
            "Ready-to-post banners, video snippets, landing pages, and brand-safe copy. Everything you need to launch a campaign in an hour.",
          bg: "bg-purple-500/10",
          border: "border-purple-500/20",
        },
        {
          icon: <Wallet className="h-5 w-5 text-amber-400" />,
          title: "Fast payouts",
          description:
            "Monthly payouts via PayPal, bank transfer, or crypto. Low minimums, no waiting periods, and full transaction history you can export.",
          bg: "bg-amber-500/10",
          border: "border-emerald-500/20",
        },
      ]}
    />
  );
}
