"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/presentation/utils";

// Matches the `TRANSITION_SMOOTH` preset in design-system.mdc — one shared
// cubic-bezier so every entrance on the marketing surface has the same
// tactile feel.
const EASE = [0.16, 1, 0.3, 1] as const;

interface FeatureCard {
  /**
   * Pre-rendered icon element — e.g. `<TrendingUp className="h-5 w-5 text-orange-400" />`.
   *
   * We accept a `ReactNode` (an already-instantiated element) rather than a
   * component reference (`LucideIcon`) because Server Components cannot
   * serialize a bare `forwardRef` component across the RSC boundary — it
   * throws "Functions cannot be passed directly to Client Components".
   * Elements are plain objects and serialize cleanly.
   */
  icon: ReactNode;
  title: string;
  description: string;
  /** Tailwind bg-* utility (usually a /10 tint) for the icon halo */
  bg: string;
  /** Tailwind border-* utility (usually a /20 tint) for the icon halo */
  border: string;
}

interface ComingSoonProps {
  /** Pre-rendered hero icon element (see `FeatureCard.icon` for the why). */
  icon: ReactNode;
  /** Tailwind bg-* utility (usually a /10 tint) for the icon halo */
  iconBg: string;
  /** Tailwind border-* utility (usually a /20 tint) for the icon halo */
  iconBorder: string;
  /**
   * Split into two halves so the accent word gets the shared `text-gradient`
   * treatment — visually consistent with `/pricing` and `/safety`.
   */
  titlePrefix: string;
  titleAccent: string;
  titleSuffix?: string;
  tagline: string;
  /** Freeform "when" copy — "Q4 2026", "Late 2026", "Rolling out soon". */
  eta?: string;
  features: FeatureCard[];
}

/**
 * Marketing-quality "coming soon" placeholder shared by every unbuilt route
 * on the public sidebar. The point is threefold:
 *
 *  1. Kill 404s on links users actually see, so the app doesn't feel broken.
 *  2. Let us keep the sidebar aspirational (Discover / Collection / etc.
 *     communicate the product roadmap even before we build the features).
 *  3. Give us a stub to attach a real waitlist email capture to later —
 *     the `Bell` input on this page is intentionally non-functional today.
 *
 * Rendered as a Client Component so the framer-motion entrance can hydrate
 * without wrapping every consuming page in `"use client"`. Data-less by
 * design — every consumer passes a fully-inlined config.
 */
export function ComingSoon({
  icon,
  iconBg,
  iconBorder,
  titlePrefix,
  titleAccent,
  titleSuffix,
  tagline,
  eta,
  features,
}: ComingSoonProps) {
  return (
    <div className="min-h-screen pt-24 pb-16">
      {/* Hero */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center mb-14"
          >
            {/* "Coming soon" pill — sits above the icon so first-time visitors
                immediately know the page is aspirational, not broken. */}
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300 mb-6">
              <Sparkles className="h-3 w-3" />
              Coming soon{eta ? ` \u2022 ${eta}` : ""}
            </div>

            <div
              className={cn(
                "inline-flex h-16 w-16 items-center justify-center rounded-2xl border mb-6",
                iconBg,
                iconBorder,
              )}
            >
              {icon}
            </div>

            <h1 className="text-5xl font-bold mb-4 tracking-tight">
              {titlePrefix} <span className="text-gradient">{titleAccent}</span>
              {titleSuffix ? ` ${titleSuffix}` : ""}
            </h1>

            <p className="text-[#9ca3af] text-lg max-w-2xl mx-auto leading-relaxed">
              {tagline}
            </p>
          </motion.div>

          {/* Feature preview grid */}
          <div className="grid sm:grid-cols-2 gap-4 mb-14">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                // Staggered per design-system.mdc — 0.1s between siblings
                // reads as intentional; anything longer feels sluggish.
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08, ease: EASE }}
                className="group relative overflow-hidden rounded-2xl border border-[#2a2a3d] bg-[#12121a] p-6 transition-all hover:border-[#3a3a50] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
              >
                <div
                  className={cn(
                    "relative inline-flex h-11 w-11 items-center justify-center rounded-xl border mb-4",
                    f.bg,
                    f.border,
                  )}
                >
                  {f.icon}
                </div>
                <h3 className="relative font-semibold text-[#f1f0ff] mb-2">
                  {f.title}
                </h3>
                <p className="relative text-sm text-[#6b7280] leading-relaxed">
                  {f.description}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Waitlist stub + fallback CTA. The form is visual-only for now —
              we'll wire it to a real /api/waitlist endpoint once the feature
              teams pick per-surface launch dates. */}
          <motion.div
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
            className="rounded-2xl border border-[#2a2a3d] bg-gradient-to-br from-[#12121a] to-[#0f0f16] p-8 text-center"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 mb-4">
              <Bell className="h-5 w-5 text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold text-[#f1f0ff] mb-2">
              Get notified when it&rsquo;s live
            </h2>
            <p className="text-sm text-[#9ca3af] mb-6 max-w-md mx-auto">
              Drop your email and we&rsquo;ll ping you the moment this rolls out.
              No spam, no marketing blasts &mdash; one message, then nothing.
            </p>
            <form
              // Non-functional intentionally — see JSDoc above.
              onSubmit={(e) => e.preventDefault()}
              className="mx-auto flex max-w-md flex-col sm:flex-row gap-2"
            >
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="flex-1 rounded-xl border border-[#2a2a3d] bg-[#0a0a12] px-4 py-2.5 text-sm text-[#f1f0ff] placeholder:text-[#4a4a5e] focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40"
              />
              <Button type="submit" className="whitespace-nowrap">
                Notify me
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#1f1f2c] flex items-center justify-center gap-3 text-xs text-[#6b7280]">
              <span>or</span>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-[#c4c2d4] hover:text-white transition-colors"
              >
                Back to Home
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
