import type { Metadata } from "next";
import { Lock, Eye, Image as ImageIcon, ShieldCheck, KeyRound } from "lucide-react";
import { ComingSoon } from "@/components/public/ComingSoon";

export const metadata: Metadata = {
  title: "Private Content \u2014 Amorify",
  description: "Unlockable galleries, private scenes, and premium moments.",
};

export default function PrivateContentPage() {
  return (
    <ComingSoon
      icon={<Lock className="h-8 w-8 text-rose-400" />}
      iconBg="bg-rose-500/10"
      iconBorder="border-rose-500/20"
      titlePrefix="Private"
      titleAccent="moments"
      titleSuffix="unlocked"
      tagline="A discreet vault for the scenes, galleries, and voice notes only you get to see. Everything gated, encrypted, and yours alone."
      eta="Premium launch"
      features={[
        {
          icon: <ImageIcon className="h-5 w-5 text-rose-400" />,
          title: "Unlockable galleries",
          description:
            "Each companion has their own private gallery. Unlock scenes as your relationship deepens, or with credits when you\u2019re impatient.",
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
        },
        {
          icon: <Eye className="h-5 w-5 text-purple-400" />,
          title: "Discreet by default",
          description:
            "Private content is hidden behind a passcode gate and stays off previews, notifications, and shared views. Nothing leaks by accident.",
          bg: "bg-purple-500/10",
          border: "border-purple-500/20",
        },
        {
          icon: <KeyRound className="h-5 w-5 text-amber-400" />,
          title: "Your keys, your rules",
          description:
            "Set a private PIN to unlock the vault, or use biometrics on mobile. You decide who can see what, and revoke access instantly.",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
        },
        {
          icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />,
          title: "Encrypted end-to-end",
          description:
            "Every unlocked asset is served over an authenticated link that expires after use. No hotlinks, no scraping, no third-party trackers.",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
        },
      ]}
    />
  );
}
