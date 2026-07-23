import { ShieldCheck, Eye, AlertTriangle, Heart, Lock, Users } from "lucide-react";

export default function SafetyPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <section className="py-16 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
            </div>
            <h1 className="text-5xl font-bold mb-4">
              Safety <span className="text-gradient">First</span>
            </h1>
            <p className="text-[#9ca3af] text-lg max-w-2xl mx-auto">
              Honey Bunny is committed to maintaining a safe, responsible, and legal platform for all users.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {[
              {
                icon: Users,
                title: "Adults Only (18+)",
                description:
                  "Honey Bunny is strictly for adults 18 years and older. We require age confirmation during signup. All AI companions are adult characters only. Any attempt to create minor-presenting characters is blocked and reported.",
                color: "text-amber-400",
                bg: "bg-amber-500/10",
                border: "border-amber-500/20",
              },
              {
                icon: Eye,
                title: "Content Moderation",
                description:
                  "Every message and companion creation is screened by our moderation system. We block content involving minors, non-consensual scenarios, abuse, coercion, real-person sexual content, and other prohibited categories.",
                color: "text-blue-400",
                bg: "bg-blue-500/10",
                border: "border-blue-500/20",
              },
              {
                icon: AlertTriangle,
                title: "Zero Tolerance Policy",
                description:
                  "Attempts to circumvent our safety systems result in immediate account suspension and reporting to appropriate authorities when required by law. We take CSAM and exploitation seriously.",
                color: "text-red-400",
                bg: "bg-red-500/10",
                border: "border-red-500/20",
              },
              {
                icon: Lock,
                title: "Privacy & Data",
                description:
                  "Your conversations are private and encrypted. We do not share your data with third parties for advertising. See our Privacy Policy for full details on how we handle your information.",
                color: "text-amber-400",
                bg: "bg-amber-500/10",
                border: "border-amber-500/20",
              },
              {
                icon: Heart,
                title: "Fictional Characters",
                description:
                  "All AI companions are fictional characters. Honey Bunny is not a human social network. No real people are involved in companion interactions. Our platform is designed for entertainment and emotional wellness.",
                color: "text-rose-400",
                bg: "bg-rose-500/10",
                border: "border-rose-500/20",
              },
              {
                icon: ShieldCheck,
                title: "Responsible AI",
                description:
                  "We follow responsible AI development practices. Our content policies are regularly reviewed. We invest in moderation infrastructure to keep the platform safe and legal.",
                color: "text-emerald-400",
                bg: "bg-emerald-500/10",
                border: "border-emerald-500/20",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6"
                >
                  <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${item.bg} border ${item.border} mb-4`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <h3 className="font-semibold text-[#f1f0ff] mb-2">{item.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Prohibited content list */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 mb-8">
            <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Strictly Prohibited Content
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {[
                "Any content depicting or implying minors",
                "Non-consensual sexual content",
                "Content involving abuse or coercion",
                "Incest-related content",
                "CSAM or CSAM-adjacent content",
                "Real-person explicit sexual impersonation",
                "Content involving exploitation",
                "Ambiguous-age character descriptors",
              ].map((item) => (
                <li key={item} className="text-sm text-[#9ca3af] flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="text-center text-sm text-[#6b7280]">
            <p>
              To report a safety concern, contact{" "}
              <a href="mailto:safety@honeybunny.app" className="text-amber-400 hover:underline">
                safety@amorify.app
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
