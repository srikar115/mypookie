"use client";

import { Children, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/presentation/utils";

/**
 * CollapsibleGrid — shows the first `initialCount` children as a grid, hides
 * the rest behind a "Show N more" pill. Wizard steps like Personality (12
 * options) and Occupation (~28 options) are too tall without this, and
 * showing every option upfront pushes the primary CTA below the fold.
 *
 * One-way toggle: once expanded, stays expanded for the rest of the wizard
 * session. This preserves the invariant that the user's selection is always
 * visible without needing to re-order children or auto-collapse.
 */

interface CollapsibleGridProps {
  className?: string;
  /** Tailwind classes for the internal `<div>` that renders the grid. */
  gridClassName?: string;
  /** How many children to show before the "Show more" toggle. Default: 6. */
  initialCount?: number;
  /** Optional label override, e.g. "Show 22 more occupations". */
  moreLabel?: (hiddenCount: number) => string;
  children: React.ReactNode;
}

export function CollapsibleGrid({
  className,
  gridClassName = "grid grid-cols-2 sm:grid-cols-3 gap-3",
  initialCount = 6,
  moreLabel,
  children,
}: CollapsibleGridProps) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const visible = expanded ? items : items.slice(0, initialCount);
  const hiddenCount = items.length - initialCount;
  const showToggle = hiddenCount > 0 && !expanded;

  return (
    <div className={className}>
      <div className={gridClassName}>{visible}</div>
      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl",
            "text-sm font-medium text-purple-300 hover:text-white",
            "border border-dashed border-[#26263a] hover:border-purple-400 hover:bg-purple-500/5",
            "transition-colors cursor-pointer",
          )}
        >
          {moreLabel ? moreLabel(hiddenCount) : `Show ${hiddenCount} more`}
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
