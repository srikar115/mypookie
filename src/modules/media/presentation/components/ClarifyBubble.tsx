"use client";
import { motion } from "framer-motion";
import { TRANSITION_SMOOTH } from "@/shared/presentation/animations";
import { cn } from "@/shared/presentation/utils";

interface Props {
  readonly question: string;
  readonly onYes: () => void;
  readonly onNo: () => void;
  readonly characterImageUrl?: string | null;
  readonly characterName?: string;
}

/**
 * ClarifyBubble — shown when classifyIntent returns confidence < 0.6.
 * Asks the user to confirm they want a photo before opening the composer.
 */
export function ClarifyBubble({ question, onYes, onNo, characterImageUrl, characterName }: Props) {
  return (
    <motion.div
      className="flex w-full justify-start"
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={TRANSITION_SMOOTH}
    >
      <div className="flex max-w-[75%] flex-col gap-2">
        {/* Avatar */}
        {characterImageUrl ? (
          <div className="h-6 w-6 overflow-hidden rounded-full border border-[#2a2a34] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={characterImageUrl} alt={characterName ?? ""} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="rounded-2xl rounded-bl-md bg-[#1a1a22] px-4 py-3 space-y-3">
          <p className="text-sm text-white/95 italic">{question}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onYes}
              className={cn(
                "flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors",
                "bg-pink-500 text-white hover:bg-pink-600",
              )}
            >
              Yes, show me 📸
            </button>
            <button
              type="button"
              onClick={onNo}
              className={cn(
                "flex-1 rounded-full py-1.5 text-xs font-medium transition-colors",
                "bg-[#252530] text-[#8a8a99] hover:bg-[#2d2d3a] hover:text-white",
              )}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
