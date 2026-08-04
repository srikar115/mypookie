"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Edit2, Loader2, AlertTriangle, Play } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { TRANSITION_SMOOTH } from "@/shared/presentation/animations";
function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface Props {
  readonly status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | null;
  readonly storageUrl: string | null;
  readonly kind: "IMAGE" | "VIDEO" | null;
  readonly at: Date;
  readonly characterImageUrl?: string | null;
  readonly characterName?: string;
  readonly errorMessage?: string | null;
  /** Called when the user taps "Edit" — opens the composer in edit mode with this as reference. */
  readonly onEdit?: (storageUrl: string) => void;
}

const LOADING_PHRASES = [
  "Getting ready…",
  "Creating for you…",
  "Almost there…",
  "Capturing the moment…",
  "Just a sec…",
] as const;

function randomLoadingPhrase() {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}

export function MediaBubble({
  status,
  storageUrl,
  kind,
  at,
  characterImageUrl,
  characterName,
  errorMessage,
  onEdit,
}: Props) {
  const [phrase] = useState(randomLoadingPhrase);
  const isPending = status === "PENDING" || status === "RUNNING";
  const isFailed = status === "FAILED";
  const isCompleted = status === "COMPLETED" && !!storageUrl;

  return (
    <div className="flex w-full justify-start">
      <div className="flex max-w-[75%] flex-col gap-2">
        {/* Avatar */}
        <div className="flex items-center gap-2">
          {characterImageUrl ? (
            <div className="h-6 w-6 overflow-hidden rounded-full border border-[#2a2a34] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={characterImageUrl} alt={characterName ?? ""} className="h-full w-full object-cover" />
            </div>
          ) : null}
        </div>

        {/* Media container */}
        {isPending ? (
          <motion.div
            className="flex aspect-square w-48 items-center justify-center rounded-2xl rounded-bl-md border border-[#2a2a34] bg-[#1a1a22]"
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={TRANSITION_SMOOTH}
          >
            <div className="flex flex-col items-center gap-2 text-[#8a8a99]">
              <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
              <span className="text-xs">{phrase}</span>
            </div>
          </motion.div>
        ) : isFailed ? (
          <motion.div
            className="flex w-48 items-center gap-2 rounded-2xl rounded-bl-md border border-red-900/40 bg-[#1a1a22] px-3 py-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={TRANSITION_SMOOTH}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span className="text-xs text-red-300/80 italic">
              {errorMessage ?? "Couldn't generate this one. Try again?"}
            </span>
          </motion.div>
        ) : isCompleted ? (
          <motion.div
            className="group relative overflow-hidden rounded-2xl rounded-bl-md border border-[#2a2a34]"
            initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={TRANSITION_SMOOTH}
          >
            {kind === "VIDEO" ? (
              <div className="relative">
                <video
                  src={storageUrl}
                  className="h-auto w-64 max-w-full rounded-2xl rounded-bl-md object-cover"
                  controls
                  playsInline
                  loop
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                    <Play className="h-5 w-5 fill-white text-white" />
                  </div>
                </div>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={storageUrl}
                alt="Generated image"
                className="h-auto w-64 max-w-full rounded-2xl rounded-bl-md object-cover"
                loading="lazy"
              />
            )}

            {/* Edit overlay on hover */}
            {onEdit && kind === "IMAGE" ? (
              <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(storageUrl!)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                    "bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80",
                  )}
                >
                  <Edit2 className="h-3 w-3" />
                  Edit
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {/* Timestamp */}
        <span className="text-[10px] text-[#8a8a99]">{formatClock(at)}</span>
      </div>
    </div>
  );
}
