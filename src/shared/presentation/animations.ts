import type { Variants, Transition } from "framer-motion";

/**
 * Motion presets used across the app. Referenced by design-system.mdc as
 * TRANSITION_SMOOTH, blurInVariants, staggerContainer, staggerItem.
 */

export const TRANSITION_SMOOTH: Transition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1],
};

export const TRANSITION_FAST: Transition = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

export const SPRING_SOFT: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.9,
};

export const blurInVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: TRANSITION_SMOOTH,
  },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export const cardHover = {
  y: -4,
  scale: 1.015,
  transition: SPRING_SOFT,
};

export const cardTap = {
  scale: 0.985,
  transition: { duration: 0.15 },
};
