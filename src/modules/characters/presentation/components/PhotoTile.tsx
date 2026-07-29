"use client";

import { Check } from "lucide-react";
import { cn } from "@/shared/presentation/utils";

/**
 * PhotoTile — the Candy.ai-style visual picker card, themed for amorify's
 * dark shell.
 *
 * Renders a background image (or a soft pink-tinted fallback when no
 * preview has been seeded) with a title chip in the bottom-left and a
 * pink check badge in the top-right when selected. Every visual picker
 * step in the wizard uses this: heritage, hair, eyes, body, fashion,
 * bond, look, personality.
 *
 * Aspect ratio and size are the only knobs; content is a fully
 * self-contained tile with no need for wrapping layout logic.
 */

export type PhotoTileAspect = "portrait" | "square" | "landscape";
export type PhotoTileSize = "sm" | "md" | "lg";

export interface PhotoTileProps {
  label: string;
  hint?: string | null;
  imageUrl?: string | null;
  /**
   * Rendered when no `imageUrl` is set — usually an emoji or icon. The
   * fallback sits inside a soft pink→purple tint so the tile still
   * reads as a visual card, not a text button.
   */
  fallback?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  aspect?: PhotoTileAspect;
  size?: PhotoTileSize;
  disabled?: boolean;
}

export function PhotoTile({
  label,
  hint,
  imageUrl,
  fallback,
  selected,
  onSelect,
  aspect = "portrait",
  size = "md",
  disabled = false,
}: PhotoTileProps) {
  const aspectClass =
    aspect === "square"
      ? "aspect-square"
      : aspect === "landscape"
        ? "aspect-[4/3]"
        : "aspect-[3/4]";

  const radius = size === "sm" ? "rounded-xl" : "rounded-2xl";
  const labelSize =
    size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "group relative w-full overflow-hidden text-left transition-all duration-200 cursor-pointer",
        aspectClass,
        radius,
        selected
          ? "ring-3 ring-pink-500 ring-offset-2 ring-offset-[#101018] shadow-lg shadow-pink-500/20"
          : "ring-1 ring-[#26263a] hover:ring-pink-400/60 shadow-sm",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-[#141420]">
          <div className="text-4xl text-pink-300/70 leading-none">
            {fallback}
          </div>
        </div>
      )}

      {/* Bottom gradient so the label is readable over any photo. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t",
          "from-black/80 via-black/40 to-transparent",
        )}
      />

      <div
        className={cn(
          "absolute bottom-2 left-2.5 right-2.5 font-semibold text-white drop-shadow",
          labelSize,
        )}
      >
        <div className="truncate">{label}</div>
        {hint ? (
          <div className="text-xs mt-0.5 font-normal text-white/75 truncate">
            {hint}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-pink-500 shadow-md flex items-center justify-center">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </div>
      ) : null}
    </button>
  );
}
