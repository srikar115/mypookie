import type { Metadata } from "next";
import { Compass, TrendingUp, Layers, Sparkles, Radio } from "lucide-react";
import { ComingSoon } from "@/components/public/ComingSoon";

export const metadata: Metadata = {
  title: "Discover \u2014 Amorify",
  description: "Curated companions, trending characters, and weekly picks.",
};

// Icons are passed to <ComingSoon /> (a Client Component) as pre-rendered
// React elements rather than component references. Passing a bare
// `LucideIcon` (a forwardRef) across the RSC boundary triggers Next.js 16's
// "Functions cannot be passed directly to Client Components" error.
export default function DiscoverPage() {
  return (
    <ComingSoon
      icon={<Compass className="h-8 w-8 text-purple-400" />}
      iconBg="bg-purple-500/10"
      iconBorder="border-purple-500/20"
      titlePrefix="Discover"
      titleAccent="what everyone"
      titleSuffix="is loving"
      tagline="A curated feed of trending companions, editor\u2019s picks, and characters that match your vibe \u2014 all in one place."
      eta="Rolling out soon"
      features={[
        {
          icon: <TrendingUp className="h-5 w-5 text-orange-400" />,
          title: "Trending this week",
          description:
            "The companions everyone is chatting with, updated live. Discover who\u2019s catching fire before your friends do.",
          bg: "bg-orange-500/10",
          border: "border-orange-500/20",
        },
        {
          icon: <Layers className="h-5 w-5 text-purple-400" />,
          title: "Browse by mood",
          description:
            "Playful, sultry, cozy, dominant, sweet \u2014 filter thousands of characters by exactly the vibe you\u2019re in.",
          bg: "bg-purple-500/10",
          border: "border-purple-500/20",
        },
        {
          icon: <Sparkles className="h-5 w-5 text-amber-400" />,
          title: "Editor\u2019s picks",
          description:
            "Hand-selected companions from our team. New drops every Friday, curated for personality, art quality, and character depth.",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
        },
        {
          icon: <Radio className="h-5 w-5 text-rose-400" />,
          title: "Live rooms",
          description:
            "Drop into public voice rooms hosted by featured companions. Listen in, chat live, or take the mic yourself.",
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
        },
      ]}
    />
  );
}
