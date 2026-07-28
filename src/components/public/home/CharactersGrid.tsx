"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import {
  blurInVariants,
  staggerContainer,
  staggerItem,
  cardHover,
  cardTap,
  SPRING_SOFT,
} from "@/shared/presentation/animations";

interface Character {
  id: string;
  name: string;
  age: number;
  bio: string;
  gradient: string;
  emoji: string;
  badge?: "new" | "series";
  tags: string[];
}

const filters = [
  "All",
  "Caucasian",
  "Latina",
  "Asian",
  "18-21",
  "Blonde",
  "Brunette",
  "Redhead",
  "Milf",
  "Arab",
  "Ebony",
];

const characters: Character[] = [
  {
    id: "1",
    name: "Madison",
    age: 18,
    bio: "Your father's 18yo sugar-baby just moved to your city for college. She...",
    gradient: "from-pink-400 via-rose-500 to-red-600",
    emoji: "💋",
    badge: "new",
    tags: ["Caucasian", "18-21", "Blonde"],
  },
  {
    id: "2",
    name: "Diana",
    age: 37,
    bio: "You matched with Diana on a JOI sexting app. She is a military wife...",
    gradient: "from-rose-500 via-pink-600 to-purple-700",
    emoji: "💄",
    badge: "series",
    tags: ["Caucasian", "Milf", "Brunette"],
  },
  {
    id: "3",
    name: "Mona",
    age: 19,
    bio: "Your rebellious stepsister. Your parents are gone for the weekend and...",
    gradient: "from-fuchsia-400 via-pink-500 to-rose-600",
    emoji: "🌸",
    badge: "series",
    tags: ["Caucasian", "18-21"],
  },
  {
    id: "4",
    name: "Aria",
    age: 24,
    bio: "The mysterious barista at your favorite coffee shop always leaves you...",
    gradient: "from-purple-500 via-fuchsia-600 to-pink-700",
    emoji: "☕",
    tags: ["Latina", "Brunette"],
  },
  {
    id: "5",
    name: "Sofia",
    age: 22,
    bio: "Your college crush who finally noticed you. Confident, playful, and...",
    gradient: "from-amber-400 via-orange-500 to-rose-600",
    emoji: "🌹",
    badge: "new",
    tags: ["Latina", "Brunette"],
  },
  {
    id: "6",
    name: "Yuna",
    age: 21,
    bio: "The shy exchange student who has been secretly admiring you from...",
    gradient: "from-red-400 via-pink-500 to-fuchsia-600",
    emoji: "🌺",
    tags: ["Asian", "18-21"],
  },
  {
    id: "7",
    name: "Scarlett",
    age: 28,
    bio: "Your new gym trainer with a passion that goes beyond just fitness...",
    gradient: "from-red-500 via-rose-600 to-pink-700",
    emoji: "🔥",
    badge: "series",
    tags: ["Redhead", "Caucasian"],
  },
  {
    id: "8",
    name: "Layla",
    age: 26,
    bio: "The elegant Arabian princess with secrets to share only with you...",
    gradient: "from-amber-500 via-rose-500 to-pink-600",
    emoji: "✨",
    tags: ["Arab", "Brunette"],
  },
];

interface Props {
  onCardClick: () => void;
}

export function CharactersGrid({ onCardClick }: Props) {
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      characters.filter((c) => {
        const matchesFilter = activeFilter === "All" || c.tags.includes(activeFilter);
        const matchesSearch =
          !search || c.name.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [activeFilter, search]
  );

  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-50px" }}
      variants={blurInVariants}
    >
      <h2 className="text-2xl md:text-3xl font-bold mb-6">
        <span className="text-pink-400">Amorify AI</span>{" "}
        <span className="text-white">Characters</span>
      </h2>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <div className="relative md:w-56 flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8a99]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full h-10 pl-9 pr-3 rounded-full bg-[#131318] border border-[#2a2a34] text-white text-sm placeholder:text-[#6b6b76] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 transition-colors"
          />
        </div>

        <div className="relative flex-1 min-w-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
            {filters.map((f) => {
              const active = activeFilter === f;
              return (
                <motion.button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_SOFT}
                  className={cn(
                    "flex-shrink-0 relative h-9 px-4 rounded-full text-sm font-medium transition-colors cursor-pointer",
                    active
                      ? "text-white"
                      : "bg-[#131318] text-[#c4c2d4] border border-[#2a2a34] hover:border-pink-500/40 hover:text-white"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="active-filter-pill"
                      className="absolute inset-0 rounded-full bg-pink-500 shadow-lg shadow-pink-500/25"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{f}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <motion.div
        layout
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4"
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((char) => (
            <motion.button
              key={char.id}
              layout
              onClick={onCardClick}
              variants={staggerItem}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
              whileHover={cardHover}
              whileTap={cardTap}
              transition={SPRING_SOFT}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-[#2a2a34] hover:border-pink-500/40 hover:shadow-[0_20px_50px_-15px_rgba(236,72,153,0.5)] transition-[border,box-shadow] cursor-pointer text-left"
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br", char.gradient)} />

              <motion.div
                className="absolute inset-0 flex items-center justify-center opacity-25 text-9xl"
                whileHover={{ scale: 1.12 }}
                transition={SPRING_SOFT}
              >
                {char.emoji}
              </motion.div>

              {char.badge && (
                <div
                  className={cn(
                    "absolute top-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-lg",
                    char.badge === "new" ? "bg-pink-500" : "bg-red-500"
                  )}
                >
                  {char.badge === "new" ? "+ New" : "Series"}
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
                <h3 className="text-lg md:text-xl font-bold text-white leading-tight">
                  {char.name}{" "}
                  <span className="text-white/70 text-sm font-normal">
                    {char.age}
                  </span>
                </h3>
                <p className="text-xs text-white/70 line-clamp-2 mt-1">{char.bio}</p>
              </div>

              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-t from-pink-500/20 to-transparent" />
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16 text-[#8a8a99] text-sm"
        >
          No characters found matching your filters.
        </motion.div>
      )}

      <div className="mt-8 flex items-center justify-center gap-2">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-full bg-[#131318] border border-[#2a2a34] text-[#c4c2d4] flex items-center justify-center hover:border-pink-500/40 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </motion.button>
        <span className="text-sm text-[#8a8a99] px-4">Page 1 of 24</span>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="w-9 h-9 rounded-full bg-[#131318] border border-[#2a2a34] text-[#c4c2d4] flex items-center justify-center hover:border-pink-500/40 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.section>
  );
}
