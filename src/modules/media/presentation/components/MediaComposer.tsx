"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { TRANSITION_SMOOTH } from "@/shared/presentation/animations";
import {
  ASPECT_RATIO_OPTIONS,
  MEDIA_COSTS,
  STYLE_PRESETS,
  chatMediaModelsFor,
  defaultChatMediaModelId,
  DEFAULT_VIDEO_RESOLUTION,
  DEFAULT_VIDEO_DURATION,
  VIDEO_DURATION_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
} from "@/config/media";
import type { RecentMediaItem, StartMediaResult } from "../../application/dto/media-generation.dto";

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Pre-filled prompt from the classified user message. */
  readonly initialPrompt: string;
  readonly kind: "IMAGE" | "VIDEO";
  readonly editMode: boolean;
  readonly referenceMediaId: string | null;
  readonly recentImages: readonly RecentMediaItem[];
  readonly onGenerate: (payload: GeneratePayload) => Promise<StartMediaResult | null>;
  readonly characterName?: string;
}

export interface GeneratePayload {
  prompt: string;
  kind: "IMAGE" | "VIDEO";
  aspectRatio: string;
  style: string | null;
  editMode: boolean;
  referenceMediaId: string | null;
  /** Model family id from the catalog — never a raw provider slug. */
  modelFamilyId: string;
  /** Video only; null for images. */
  resolution: string | null;
  duration: number | null;
}

export function MediaComposer({
  open,
  onClose,
  initialPrompt,
  kind,
  editMode: initialEditMode,
  referenceMediaId: initialRefId,
  recentImages,
  onGenerate,
  characterName,
}: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState(kind === "VIDEO" ? "9:16" : "1:1");
  const [style, setStyle] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(initialEditMode);
  const [referenceMediaId, setReferenceMediaId] = useState<string | null>(initialRefId);
  const [modelFamilyId, setModelFamilyId] = useState(() => defaultChatMediaModelId(kind));
  const [resolution, setResolution] = useState<string>(DEFAULT_VIDEO_RESOLUTION);
  const [duration, setDuration] = useState<number>(DEFAULT_VIDEO_DURATION);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const models = chatMediaModelsFor(kind);

  // Auto-focus when the sheet opens. State is reset by the parent
  // via a `key` prop change, which remounts the component cleanly.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => textareaRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [open]);

  const cost = kind === "VIDEO" ? MEDIA_COSTS.VIDEO : MEDIA_COSTS.IMAGE;

  async function handleGenerate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await onGenerate({
        prompt: prompt.trim(),
        kind,
        aspectRatio,
        style,
        editMode,
        referenceMediaId,
        modelFamilyId,
        resolution: kind === "VIDEO" ? resolution : null,
        duration: kind === "VIDEO" ? duration : null,
      });
      if (result) {
        onClose();
      } else {
        setErrorMsg("Could not start generation. Please try again.");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-xl rounded-t-2xl bg-[#0d0d13] border-t border-[#1e1e26] pb-safe"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e26]">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                  {kind === "VIDEO" ? "Generate a video" : "Generate an image"}
                </span>
                {characterName ? (
                  <span className="text-xs text-[#8a8a99]">
                    {cost} credits · cancel anytime, nothing is spent until you confirm.
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#8a8a99] hover:bg-[#1a1a22] hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Prompt textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                  What should we generate?
                </label>
                <textarea
                  ref={textareaRef}
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the scene…"
                  className="w-full resize-none rounded-xl border border-[#2a2a34] bg-[#131318] px-3 py-2.5 text-sm text-white placeholder:text-[#6b6b76] outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/30 transition-colors"
                />
              </div>

              {/* Model picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                  Model
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {models.map((m) => {
                    const selected = modelFamilyId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setModelFamilyId(m.id)}
                        className={cn(
                          "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                          selected
                            ? "border-pink-500 bg-pink-500/10"
                            : "border-[#2a2a34] bg-[#131318] hover:border-[#3a3a44]",
                        )}
                      >
                        <span
                          className={cn(
                            "text-sm font-medium",
                            selected ? "text-white" : "text-[#c9c9d4]",
                          )}
                        >
                          {m.label}
                        </span>
                        <span className="text-[11px] text-[#8a8a99]">{m.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reference image grid */}
              {recentImages.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                    Edit a previous image
                  </label>
                  <p className="text-[11px] text-[#6b6b76]">
                    Tap an image to use it as the starting point.
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {recentImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => {
                          setReferenceMediaId(
                            referenceMediaId === img.id ? null : img.id,
                          );
                          setEditMode(referenceMediaId !== img.id);
                        }}
                        className={cn(
                          "h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                          referenceMediaId === img.id
                            ? "border-pink-500"
                            : "border-[#2a2a34] hover:border-[#3a3a44]",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.storageUrl}
                          alt="Reference"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Advanced options toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-pink-400 hover:text-pink-300 transition-colors"
              >
                {showAdvanced ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {showAdvanced ? "Hide" : "Show"} advanced options
              </button>

              <AnimatePresence>
                {showAdvanced ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={TRANSITION_SMOOTH}
                    className="space-y-4 overflow-hidden"
                  >
                    {/* Aspect ratio */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                        Aspect ratio
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ASPECT_RATIO_OPTIONS.map((ar) => (
                          <button
                            key={ar}
                            type="button"
                            onClick={() => setAspectRatio(ar)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              aspectRatio === ar
                                ? "bg-pink-500 text-white"
                                : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
                            )}
                          >
                            {ar}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Video-only options */}
                    {kind === "VIDEO" ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                            Duration
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {VIDEO_DURATION_OPTIONS.map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setDuration(d)}
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                  duration === d
                                    ? "bg-pink-500 text-white"
                                    : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
                                )}
                              >
                                {d}s
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                            Resolution
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {VIDEO_RESOLUTION_OPTIONS.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setResolution(r)}
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                  resolution === r
                                    ? "bg-pink-500 text-white"
                                    : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
                                )}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* Style presets */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#8a8a99] uppercase tracking-wide">
                        Style
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setStyle(null)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            style === null
                              ? "bg-pink-500 text-white"
                              : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
                          )}
                        >
                          Default
                        </button>
                        {STYLE_PRESETS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStyle(style === s ? null : s)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              style === s
                                ? "bg-pink-500 text-white"
                                : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Error */}
              {errorMsg ? (
                <p className="text-xs text-red-400">{errorMsg}</p>
              ) : null}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[#2a2a34] py-2.5 text-sm text-[#8a8a99] hover:border-[#3a3a44] hover:text-white transition-colors"
                >
                  <X className="mr-1.5 inline h-3.5 w-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors",
                    loading || !prompt.trim()
                      ? "bg-[#1a1a22] text-[#4a4a55] cursor-not-allowed"
                      : "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Generate · {cost} cr
                </button>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
