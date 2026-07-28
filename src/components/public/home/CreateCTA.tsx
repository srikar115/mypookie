"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blurInVariants,
  staggerContainer,
  staggerItem,
  SPRING_SOFT,
} from "@/shared/presentation/animations";

interface Props {
  onClick: () => void;
}

const avatarGradients = [
  { g: "from-pink-400 to-rose-500", emoji: "💕" },
  { g: "from-purple-400 to-pink-500", emoji: "✨" },
  { g: "from-fuchsia-400 to-purple-500", emoji: "🌸" },
];

export function CreateCTA({ onClick }: Props) {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={blurInVariants}
      className="relative rounded-2xl overflow-hidden border border-pink-500/20 bg-gradient-to-r from-pink-950/50 via-rose-950/40 to-purple-950/50 p-6 md:p-10"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(236,72,153,0.15),transparent_60%)] pointer-events-none" />

      <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-8">
        <motion.div
          className="flex -space-x-4 flex-shrink-0"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {avatarGradients.map((a, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              whileHover={{ y: -4, scale: 1.08, zIndex: 10 }}
              transition={SPRING_SOFT}
              className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br ${a.g} border-4 border-[#0a0a0f] flex items-center justify-center text-2xl md:text-3xl shadow-xl relative cursor-pointer`}
            >
              {a.emoji}
            </motion.div>
          ))}
        </motion.div>

        <div className="flex-1 text-center md:text-left">
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
            Create your own AI Girlfriend
          </h3>
          <p className="text-sm text-[#c4c2d4]">
            Your dream companion awaits! Shape her look, personality, and bring
            her to life in one click. 100% powered by Artificial Intelligence.
          </p>
        </div>

        <motion.div
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING_SOFT}
          className="flex-shrink-0"
        >
          <Button size="lg" onClick={onClick} className="group">
            <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" />
            Create your AI
          </Button>
        </motion.div>
      </div>
    </motion.section>
  );
}
