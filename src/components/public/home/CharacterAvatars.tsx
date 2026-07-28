"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem, SPRING_SOFT } from "@/shared/presentation/animations";

interface Avatar {
  id: string;
  name: string;
  gradient: string;
  initial: string;
}

const avatars: Avatar[] = [
  { id: "1", name: "Azura", initial: "A", gradient: "from-purple-500 to-pink-500" },
  { id: "2", name: "Eda", initial: "E", gradient: "from-rose-500 to-orange-500" },
  { id: "3", name: "Isabella", initial: "I", gradient: "from-amber-500 to-rose-500" },
  { id: "4", name: "Darkangel6", initial: "D", gradient: "from-violet-500 to-fuchsia-500" },
  { id: "5", name: "Yuna", initial: "Y", gradient: "from-pink-400 to-red-500" },
  { id: "6", name: "Kira", initial: "K", gradient: "from-indigo-500 to-purple-500" },
  { id: "7", name: "Kim", initial: "K", gradient: "from-rose-400 to-pink-500" },
  { id: "8", name: "Kasia", initial: "K", gradient: "from-fuchsia-500 to-purple-600" },
  { id: "9", name: "Sanyae", initial: "S", gradient: "from-orange-500 to-rose-500" },
  { id: "10", name: "Sofia", initial: "S", gradient: "from-amber-400 to-pink-500" },
  { id: "11", name: "Sp00kybby", initial: "S", gradient: "from-slate-600 to-purple-700" },
  { id: "12", name: "Charly", initial: "C", gradient: "from-pink-500 to-red-600" },
  { id: "13", name: "Aria", initial: "A", gradient: "from-cyan-500 to-blue-500" },
  { id: "14", name: "Nova", initial: "N", gradient: "from-emerald-500 to-teal-500" },
];

interface Props {
  onClick: () => void;
}

export function CharacterAvatars({ onClick }: Props) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={staggerContainer}
      className="relative z-10"
    >
      <div className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide pt-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {avatars.map((a) => (
          <motion.button
            key={a.id}
            onClick={onClick}
            variants={staggerItem}
            whileHover={{ y: -4, scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_SOFT}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div
              className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-gradient-to-br ${a.gradient} p-[2px] shadow-lg`}
            >
              <div className="w-full h-full rounded-full bg-[#0a0a0f] p-0.5">
                <div
                  className={`w-full h-full rounded-full bg-gradient-to-br ${a.gradient} flex items-center justify-center text-white font-bold text-xl`}
                >
                  {a.initial}
                </div>
              </div>
            </div>
            <span className="text-xs text-[#c4c2d4] group-hover:text-white transition-colors truncate max-w-[80px]">
              {a.name}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
