"use client";

import { Sparkles } from "lucide-react";

/**
 * Shown while CreateCharacterDraftUseCase runs. Fal Z-Image Turbo is
 * sub-2.5s but factor in the prompt compile + DB writes + R2 upload;
 * expect 3-8s round-trip in practice.
 */
export function ProgressScreen({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-2xl animate-pulse" />
        <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
          <Sparkles className="h-10 w-10 text-white" />
        </div>
      </div>
      <h2 className="mt-8 text-3xl font-bold text-white">
        Creating {name.trim().length ? name : "your AI"}…
      </h2>
      <p className="mt-3 text-[#c4c2d4] max-w-md">
        We&apos;re bringing her to life. This usually takes 3–8 seconds.
      </p>
      <div className="mt-8 w-full max-w-md h-1.5 rounded-full bg-[#1a1a26] overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-purple-500 to-pink-500 animate-[progress_2s_ease-in-out_infinite]" />
      </div>
      <style jsx>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
