"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { WIZARD_STEP_ORDER, WIZARD_TOTAL_STEPS, type WizardStep } from "./wizard-state";

/**
 * WizardShell — Candy.ai-style wizard chrome, themed to match the rest
 * of amorify.ai (dark bg #0a0a0f, pink→rose brand accents).
 *
 * Renders a "Step X of 11" pill + progress bar, the step's
 * heading/subheading, the step body, and the sticky back/continue
 * footer. Every step reuses this so the visual rhythm is consistent.
 */

interface WizardShellProps {
  step: WizardStep;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
  isSubmitting?: boolean;
  continueLabel?: string;
  isFirst?: boolean;
  isLast?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

export function WizardShell({
  step,
  title,
  subtitle,
  onBack,
  onContinue,
  canContinue,
  isSubmitting = false,
  continueLabel,
  isFirst = false,
  isLast = false,
  error = null,
  children,
}: WizardShellProps) {
  const idx = WIZARD_STEP_ORDER.indexOf(step as (typeof WIZARD_STEP_ORDER)[number]);
  const stepNumber = idx >= 0 ? idx + 1 : 1;
  const progressPct = Math.max(
    6,
    Math.round((stepNumber / WIZARD_TOTAL_STEPS) * 100),
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] py-8 md:py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Progress pill + bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-full bg-[#141420] border border-[#26263a] px-3 py-1.5 text-xs font-semibold text-[#c4c2d4] whitespace-nowrap">
            Step {stepNumber} of {WIZARD_TOTAL_STEPS}
          </div>
          <div className="flex-1 h-2 rounded-full bg-[#1a1a26] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-rose-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Wizard card */}
        <div className="bg-[#101018] border border-[#1e1e26] rounded-3xl shadow-2xl shadow-black/40 p-6 md:p-10">
          <h1 className="font-serif text-3xl md:text-4xl text-white leading-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[#8a8a99] text-sm md:text-base">
              {subtitle}
            </p>
          ) : null}

          <div className="mt-6 md:mt-8">{children}</div>

          {error ? (
            <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirst || isSubmitting}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-medium",
                "text-[#8a8a99] hover:text-white transition-colors cursor-pointer",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue || isSubmitting}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold shadow-md transition-all cursor-pointer",
                canContinue && !isSubmitting
                  ? "bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-pink-500/30"
                  : "bg-[#1a1a26] text-[#5a5a66] cursor-not-allowed",
              )}
            >
              {continueLabel ?? (isLast ? "Bring my AI to life" : "Continue")}
              {!isLast ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
