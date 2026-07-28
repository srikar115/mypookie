"use client";

import { motion, type Variants } from "framer-motion";
import { blurInVariants } from "@/shared/presentation/animations";
import { cn } from "@/shared/presentation/utils";

interface MotionSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "section" | "div" | "article";
  variants?: Variants;
  delay?: number;
  once?: boolean;
  margin?: string;
  children: React.ReactNode;
}

/**
 * Blur-in section entrance that fires once when it scrolls into view.
 * Wrap any home page section in this to satisfy the design-system.mdc entrance standard.
 */
export function MotionSection({
  as = "section",
  variants = blurInVariants,
  delay = 0,
  once = true,
  margin = "-50px",
  className,
  children,
  ...rest
}: MotionSectionProps) {
  const Comp = motion[as] as typeof motion.div;

  return (
    <Comp
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: margin as `${number}px` }}
      variants={variants}
      transition={{ delay }}
      className={cn(className)}
      {...(rest as React.ComponentProps<typeof motion.div>)}
    >
      {children}
    </Comp>
  );
}
