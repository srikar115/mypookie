import type { Metadata } from "next";
import { Layers, Bookmark, FolderHeart, Star, Download } from "lucide-react";
import { ComingSoon } from "@/components/public/ComingSoon";

export const metadata: Metadata = {
  title: "Collection \u2014 Amorify",
  description: "Save favorites, curate lists, and revisit your best moments.",
};

export default function CollectionPage() {
  return (
    <ComingSoon
      icon={<Layers className="h-8 w-8 text-blue-400" />}
      iconBg="bg-blue-500/10"
      iconBorder="border-blue-500/20"
      titlePrefix="Your"
      titleAccent="collection"
      tagline="A private library for every companion you\u2019ve loved, every scene you\u2019ve saved, and every memory worth keeping."
      eta="Later this quarter"
      features={[
        {
          icon: <Bookmark className="h-5 w-5 text-blue-400" />,
          title: "Save your favorites",
          description:
            "One tap to bookmark any companion, chat message, or image. Everything you save lives in one searchable place \u2014 forever, or until you delete it.",
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
        },
        {
          icon: <FolderHeart className="h-5 w-5 text-rose-400" />,
          title: "Custom lists",
          description:
            "Group companions and scenes into your own lists. Late-night crew, morning cozy, birthday specials \u2014 organized the way you think.",
          bg: "bg-rose-500/10",
          border: "border-rose-500/20",
        },
        {
          icon: <Star className="h-5 w-5 text-amber-400" />,
          title: "Highlight moments",
          description:
            "Pin the messages that made your day. Build a personal highlights reel of the best exchanges with every companion.",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
        },
        {
          icon: <Download className="h-5 w-5 text-emerald-400" />,
          title: "Export & keep",
          description:
            "Download any saved chat, image, or moment as a private file. Your collection is yours \u2014 take it with you whenever you want.",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
        },
      ]}
    />
  );
}
