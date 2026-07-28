"use client";

import { cn } from "@/shared/presentation/utils";

/**
 * PickerTile — the reusable choice card used across every wizard step.
 * Matches candy.ai's visual language: rounded rectangle, hover lift, active
 * state highlighted with a purple ring and tinted background.
 */

export interface PickerTileProps {
  label: string;
  description?: string | null;
  icon?: React.ReactNode;
  imageUrl?: string | null;
  selected: boolean;
  onSelect: () => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function PickerTile({
  label,
  description,
  icon,
  imageUrl,
  selected,
  onSelect,
  size = "md",
  disabled = false,
}: PickerTileProps) {
  const sizeClasses =
    size === "sm"
      ? "px-3 py-2.5 text-sm"
      : size === "lg"
        ? "px-5 py-4 text-base"
        : "px-4 py-3 text-sm";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group relative w-full rounded-2xl text-left transition-all duration-200 cursor-pointer border",
        sizeClasses,
        selected
          ? "bg-purple-500/10 border-purple-400/70 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/10"
          : "bg-[#141420] border-[#26263a] hover:border-[#3a3a54] hover:bg-[#191927]",
        disabled && "opacity-40 cursor-not-allowed",
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-10 w-10 rounded-lg object-cover shrink-0"
          />
        ) : icon ? (
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-lg",
              selected ? "bg-purple-500/20 text-purple-200" : "bg-[#1e1e2e] text-[#a8a6bd]",
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "font-medium truncate",
              selected ? "text-white" : "text-[#e5e3f5]",
            )}
          >
            {label}
          </div>
          {description ? (
            <div className="text-xs text-[#8a8a99] truncate mt-0.5">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
