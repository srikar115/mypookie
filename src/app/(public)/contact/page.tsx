import type { Metadata } from "next";
import { Mail, MessageSquareText, Bug, Handshake, LifeBuoy } from "lucide-react";
import { ComingSoon } from "@/components/public/ComingSoon";

export const metadata: Metadata = {
  title: "Contact Us \u2014 Amorify",
  description: "Support, feedback, bug reports, and partnerships.",
};

export default function ContactPage() {
  return (
    <ComingSoon
      icon={<Mail className="h-8 w-8 text-sky-400" />}
      iconBg="bg-sky-500/10"
      iconBorder="border-sky-500/20"
      titlePrefix="Get in"
      titleAccent="touch"
      tagline="Real humans read every message. Whether it\u2019s a bug, a feature idea, or a partnership pitch \u2014 we want to hear from you."
      eta="Contact form coming soon"
      features={[
        {
          icon: <LifeBuoy className="h-5 w-5 text-sky-400" />,
          title: "Product support",
          description:
            "Stuck on a checkout, a broken chat, or a payment question? Our support team replies within one business day, usually much faster.",
          bg: "bg-sky-500/10",
          border: "border-sky-500/20",
        },
        {
          icon: <MessageSquareText className="h-5 w-5 text-purple-400" />,
          title: "Feature requests",
          description:
            "Have an idea that would make Amorify better? Tell us. The best ideas ship \u2014 we publicly credit the people who suggest them.",
          bg: "bg-purple-500/10",
          border: "border-purple-500/20",
        },
        {
          icon: <Bug className="h-5 w-5 text-amber-400" />,
          title: "Report a bug",
          description:
            "Something broken, glitchy, or off? Send us a screenshot and a note. Confirmed bugs earn credits as a thank-you.",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
        },
        {
          icon: <Handshake className="h-5 w-5 text-emerald-400" />,
          title: "Partnerships",
          description:
            "Creator collabs, brand integrations, licensing, or press \u2014 we\u2019re open. Reach out and we\u2019ll route you to the right person.",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
        },
      ]}
    />
  );
}
