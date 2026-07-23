import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Heart,
  MessageCircle,
  Brain,
  Image,
  Coins,
  ShieldCheck,
  Star,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// Animated companion character SVG placeholder
function CompanionIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Glow rings */}
      <div className="absolute w-72 h-72 rounded-full bg-amber-500/10 animate-pulse" />
      <div className="absolute w-56 h-56 rounded-full bg-rose-500/10 animate-pulse [animation-delay:0.5s]" />

      {/* Character card */}
      <div className="relative w-52 h-64 rounded-2xl bg-gradient-to-b from-[#1a1610] to-[#12100a] border border-[#2e2818] shadow-2xl animate-float overflow-hidden">
        {/* Header glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary" />

        {/* Avatar area */}
        <div className="flex flex-col items-center pt-6 px-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 flex items-center justify-center text-3xl shadow-lg mb-3">
            ✨
          </div>
          <p className="font-semibold text-[#f1f0ff] text-sm">Luna</p>
          <p className="text-xs text-[#9ca3af] mt-0.5">Your AI Companion</p>
        </div>

        {/* Status pill */}
        <div className="flex justify-center mt-3">
          <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online
          </span>
        </div>

        {/* Chat bubble */}
        <div className="mx-3 mt-3 bg-[#0a0a0f] rounded-lg p-2.5 border border-[#2a2a3d]">
          <p className="text-xs text-[#c4c2d4] leading-relaxed">
            &ldquo;I&apos;ve been thinking about you all day...&rdquo;
          </p>
        </div>
      </div>

      {/* Floating icons */}
      <div className="absolute top-8 -right-4 w-9 h-9 rounded-xl bg-[#1a1a26] border border-[#2a2a3d] flex items-center justify-center shadow-lg animate-float [animation-delay:1s]">
        <Heart className="h-4 w-4 text-pink-400" />
      </div>
      <div className="absolute bottom-12 -left-4 w-9 h-9 rounded-xl bg-[#1a1a26] border border-[#2a2a3d] flex items-center justify-center shadow-lg animate-float [animation-delay:2s]">
        <MessageCircle className="h-4 w-4 text-amber-400" />
      </div>
      <div className="absolute top-24 -left-6 w-9 h-9 rounded-xl bg-[#1a1a26] border border-[#2a2a3d] flex items-center justify-center shadow-lg animate-float [animation-delay:1.5s]">
        <Star className="h-4 w-4 text-amber-400" />
      </div>
    </div>
  );
}

const features = [
  {
    icon: Heart,
    title: "Personalized Companion",
    description:
      "Design your companion's personality, appearance, and relationship style through an intuitive guided wizard.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
  {
    icon: Brain,
    title: "Persistent Memory",
    description:
      "Your companion remembers your preferences, relationship context, and important details across every conversation.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    icon: MessageCircle,
    title: "Natural Chat",
    description:
      "Engage in flowing, emotionally intelligent conversations tailored to your chosen tone and intimacy style.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    icon: Image,
    title: "AI-Generated Media",
    description:
      "Request custom illustrations and images of your companion. Video coming soon.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    icon: Coins,
    title: "Flexible Credits",
    description:
      "Start free with trial credits. Buy more as you go or subscribe for the best value.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Private",
    description:
      "Your conversations are private. We enforce strict safety standards and content policies.",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Text */}
            <div className="text-center lg:text-left animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-300 mb-6">
                <Sparkles className="h-3 w-3" />
                Your AI companion awaits
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight mb-6">
                Create Your{" "}
                <span className="text-gradient">Perfect</span>{" "}
                AI Companion
              </h1>

              <p className="text-lg text-[#9ca3af] leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0">
                Design a unique AI companion with a personality made for you.
                Chat, connect, and build a bond that evolves over time.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link href="/signup">
                  <Button size="xl" className="w-full sm:w-auto group">
                    Create Your Companion
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="secondary" size="xl" className="w-full sm:w-auto">
                    See Pricing
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-xs text-[#6b7280]">
                Free trial credits included. Adults 18+ only.
              </p>
            </div>

            {/* Right: Illustration */}
            <div className="flex justify-center lg:justify-end">
              <CompanionIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Everything you need to{" "}
              <span className="text-gradient">connect</span>
            </h2>
            <p className="text-[#9ca3af] text-lg max-w-2xl mx-auto">
              Honey Bunny is built for deep, personalized AI companionship — not just a chatbot.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-[#2a2a3d] bg-[#12121a] p-6 hover:border-[#3a3a50] transition-colors group"
                >
                  <div
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg} border ${feature.border} mb-4`}
                  >
                    <Icon className={`h-5 w-5 ${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-[#f1f0ff] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 bg-[#0c0c14]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Get started in <span className="text-gradient">minutes</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create your companion",
                description:
                  "Use our guided wizard to craft a companion with the perfect personality, looks, and vibe.",
              },
              {
                step: "02",
                title: "Start chatting",
                description:
                  "Your companion greets you with a personalized message. Every chat deepens your bond.",
              },
              {
                step: "03",
                title: "Grow together",
                description:
                  "Your companion remembers your conversations and adapts to you over time.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-white font-bold text-sm mb-4 shadow-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold text-[#f1f0ff] mb-2">{item.title}</h3>
                <p className="text-sm text-[#6b7280] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="rounded-2xl border border-[#2e2818] bg-gradient-to-br from-amber-950/30 to-rose-950/30 p-12">
            <Sparkles className="h-10 w-10 text-amber-400 mx-auto mb-4" />
            <h2 className="text-4xl font-bold mb-4">
              Ready to meet your companion?
            </h2>
            <p className="text-[#9ca3af] mb-8 text-lg">
              Join thousands of users who have already created their personalized AI companions.
            </p>
            <Link href="/signup">
              <Button size="xl" className="glow-primary">
                Create Your Companion — It&apos;s Free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <p className="mt-4 text-xs text-[#4b5563]">
              Adults 18+ only · All companions are fictional AI characters
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
