"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface WizardStepProps {
  step: number;
  currentStep: number;
  totalSteps: number;
  title: string;
}

export function WizardProgressBar({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#6b7280]">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-xs text-[#6b7280]">
          {Math.round((currentStep / totalSteps) * 100)}% complete
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a1a26] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-primary transition-all duration-500"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
    </div>
  );
}

interface OptionCardProps {
  label: string;
  description?: string;
  emoji?: string;
  selected: boolean;
  onClick: () => void;
}

export function OptionCard({
  label,
  description,
  emoji,
  selected,
  onClick,
}: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full rounded-xl border p-4 text-left transition-all duration-150",
        selected
          ? "border-purple-500/50 bg-purple-500/10 shadow-md shadow-purple-500/10"
          : "border-[#2a2a3d] bg-[#12121a] hover:border-[#3a3a50] hover:bg-[#1a1a26]"
      )}
    >
      {selected && (
        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
      <div className="flex items-start gap-3">
        {emoji && (
          <span className="text-xl leading-none mt-0.5">{emoji}</span>
        )}
        <div>
          <p className={cn("text-sm font-medium", selected ? "text-purple-200" : "text-[#f1f0ff]")}>
            {label}
          </p>
          {description && (
            <p className="text-xs text-[#6b7280] mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: SliderFieldProps) {
  const level =
    value >= 80 ? "Very High" : value >= 60 ? "High" : value >= 40 ? "Medium" : value >= 20 ? "Low" : "Very Low";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-[#c4c2d4]">{label}</label>
        <span className="text-xs text-purple-400 font-medium">{level}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[#1a1a26] accent-purple-500"
      />
    </div>
  );
}
