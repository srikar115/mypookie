import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
        secondary: "bg-[#1a1a26] text-[#c4c2d4] border border-[#2a2a3d]",
        success: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
        destructive: "bg-red-500/10 text-red-300 border border-red-500/20",
        accent: "bg-pink-500/10 text-pink-300 border border-pink-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
