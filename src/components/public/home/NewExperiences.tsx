"use client";

import { motion } from "framer-motion";
import { ChevronRight, Play, Lock, Radio } from "lucide-react";
import {
  blurInVariants,
  staggerContainer,
  staggerItem,
  cardHover,
  cardTap,
  SPRING_SOFT,
} from "@/shared/presentation/animations";
import { cn } from "@/shared/presentation/utils";

interface Experience {
  id: string;
  title: string;
  cta: string;
  ctaIcon?: "play" | "lock" | "live";
  gradient: string;
  emoji: string;
  live?: boolean;
}

const experiences: Experience[] = [
  {
    id: "private-content",
    title: "Private Content",
    cta: "Unlock",
    ctaIcon: "lock",
    gradient: "from-purple-900 via-pink-800 to-rose-900",
    emoji: "🔒",
  },
  {
    id: "velvethex",
    title: "VelvetHex",
    cta: "Watch now",
    ctaIcon: "play",
    gradient: "from-slate-800 via-purple-900 to-pink-900",
    emoji: "🎬",
    live: true,
  },
  {
    id: "shorts",
    title: "Amorify Shorts",
    cta: "Watch now",
    ctaIcon: "play",
    gradient: "from-pink-900 via-fuchsia-800 to-purple-900",
    emoji: "🎥",
  },
  {
    id: "cams",
    title: "Amorify Cams",
    cta: "Watch now",
    ctaIcon: "play",
    gradient: "from-rose-900 via-red-800 to-pink-900",
    emoji: "📸",
    live: true,
  },
  {
    id: "roulette",
    title: "Amorify Roulette",
    cta: "Chat with me",
    ctaIcon: "play",
    gradient: "from-fuchsia-900 via-pink-800 to-red-900",
    emoji: "🎰",
  },
];

interface Props {
  onCardClick: () => void;
}

export function NewExperiences({ onCardClick }: Props) {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-50px" }}
      variants={blurInVariants}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white">
          <span className="text-pink-400">New</span> Experiences
        </h2>
        <button className="text-xs text-[#8a8a99] hover:text-white flex items-center gap-1 cursor-pointer transition-colors">
          See all <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4"
      >
        {experiences.map((exp) => (
          <motion.button
            key={exp.id}
            onClick={onCardClick}
            variants={staggerItem}
            whileHover={cardHover}
            whileTap={cardTap}
            transition={SPRING_SOFT}
            className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-[#2a2a34] cursor-pointer hover:border-pink-500/40 hover:shadow-[0_10px_40px_-10px_rgba(236,72,153,0.4)] transition-[border,box-shadow]"
          >
            <div className={cn("absolute inset-0 bg-gradient-to-br", exp.gradient)} />

            <motion.div
              className="absolute inset-0 flex items-center justify-center opacity-30 text-8xl"
              whileHover={{ scale: 1.15, rotate: 5 }}
              transition={SPRING_SOFT}
            >
              {exp.emoji}
            </motion.div>

            {exp.live && (
              <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/95 text-white text-[10px] font-bold shadow-lg">
                <Radio className="h-2.5 w-2.5 animate-pulse" />
                LIVE
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

            <div className="absolute inset-0 flex flex-col justify-end p-3 md:p-4">
              <p className="text-sm md:text-base font-semibold text-white mb-2 text-left">
                {exp.title}
              </p>
              <div className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full bg-pink-500 group-hover:bg-pink-400 text-white text-xs font-semibold transition-colors w-fit mx-auto">
                {exp.ctaIcon === "lock" ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3 fill-current" />
                )}
                {exp.cta}
              </div>
            </div>

            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-t from-pink-500/15 to-transparent" />
          </motion.button>
        ))}
      </motion.div>
    </motion.section>
  );
}
