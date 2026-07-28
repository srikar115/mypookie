"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { blurInVariants, TRANSITION_SMOOTH } from "@/shared/presentation/animations";

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  cta: string;
  gradient: string;
  emoji: string;
}

const slides: Slide[] = [
  {
    id: "shorts",
    title: "Honey Trap in Silk",
    subtitle: "AMORIFY SHORTS · NEW EPISODES AVAILABLE",
    badge: "NEW!",
    cta: "Watch Now",
    gradient: "from-rose-900/70 via-pink-800/60 to-purple-900/70",
    emoji: "💋",
  },
  {
    id: "premium",
    title: "Unlock Premium Access",
    subtitle: "UNLIMITED CHATS · EXCLUSIVE CHARACTERS",
    badge: "-55%",
    cta: "Upgrade Now",
    gradient: "from-purple-900/70 via-fuchsia-800/60 to-pink-900/70",
    emoji: "👑",
  },
  {
    id: "create",
    title: "Create Your Dream Companion",
    subtitle: "PERSONALIZED · ADAPTIVE · REAL",
    badge: "AI",
    cta: "Get Started",
    gradient: "from-indigo-900/70 via-purple-800/60 to-rose-900/70",
    emoji: "✨",
  },
];

interface HeroCarouselProps {
  onCtaClick: () => void;
}

export function HeroCarousel({ onCtaClick }: HeroCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false }, [
    Autoplay({ delay: 6000, stopOnInteraction: false, stopOnMouseEnter: true }),
  ]);

  const [selected, setSelected] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-50px" }}
      variants={blurInVariants}
      className="relative"
    >
      <div
        ref={emblaRef}
        className="overflow-hidden rounded-2xl border border-[#2a2a34] cursor-grab active:cursor-grabbing"
      >
        <div className="flex">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className="relative flex-[0_0_100%] h-36 sm:h-40 md:h-44 lg:h-48 xl:h-56 overflow-hidden"
            >
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-r",
                  slide.gradient
                )}
              />

              <div className="absolute inset-0 opacity-40">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(236,72,153,0.4),transparent_50%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(168,85,247,0.3),transparent_50%)]" />
              </div>

              <div className="absolute left-0 top-0 bottom-0 w-2/5 hidden md:flex items-center justify-center opacity-80 pointer-events-none">
                <motion.div
                  className="text-6xl lg:text-7xl xl:text-8xl"
                  animate={{
                    rotate: selected === i ? [-12, -8, -12] : -12,
                    scale: selected === i ? [1, 1.05, 1] : 1,
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {slide.emoji}
                </motion.div>
              </div>

              <div className="absolute inset-0 flex items-center justify-end pointer-events-none">
                <motion.div
                  className="px-5 md:px-10 md:pr-12 max-w-xl text-right md:text-left pointer-events-auto"
                  initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
                  animate={
                    selected === i
                      ? { opacity: 1, y: 0, filter: "blur(0px)" }
                      : { opacity: 0, y: 20, filter: "blur(6px)" }
                  }
                  transition={{ ...TRANSITION_SMOOTH, delay: 0.15 }}
                >
                  {slide.badge && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-pink-500/90 text-white text-[10px] md:text-xs font-bold mb-2">
                      {slide.badge}
                    </span>
                  )}
                  <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white leading-tight mb-1.5 drop-shadow-lg">
                    {slide.title}
                  </h2>
                  <p className="text-[10px] md:text-xs text-white/80 tracking-wider mb-3 md:mb-4 font-medium">
                    {slide.subtitle}
                  </p>
                  <motion.button
                    onClick={onCtaClick}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                    className="inline-flex items-center gap-1.5 px-4 md:px-5 py-2 md:py-2.5 rounded-full bg-white text-black text-xs md:text-sm font-semibold shadow-2xl cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {slide.cta}
                  </motion.button>
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={scrollPrev}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 hover:scale-110 transition-all cursor-pointer z-10"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={scrollNext}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 hover:scale-110 transition-all cursor-pointer z-10"
        aria-label="Next slide"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all cursor-pointer",
              i === selected ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
            )}
          />
        ))}
      </div>
    </motion.div>
  );
}
