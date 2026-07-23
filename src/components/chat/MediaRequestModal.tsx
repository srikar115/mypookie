"use client";

import { useState, useEffect } from "react";
import { X, ImageIcon, VideoIcon, Loader2, Sparkles, AlertCircle } from "lucide-react";

type ModalType = "image" | "video";

interface MediaRequestModalProps {
  type: ModalType;
  companionId: string;
  companionName: string;
  companionStyle: string;
  conversationId?: string;
  initialRequest?: string;
  /** Initial aspect ratio — read from per-conversation defaults so the modal stays consistent with the popover. */
  initialAspectRatio?: "portrait" | "square" | "landscape";
  /** Initial video duration — read from per-conversation defaults. */
  initialDuration?: "5" | "8" | "10";
  /** Initial style label (image only) — defaults to first IMAGE_STYLES entry. */
  initialStyle?: string;
  /**
   * Whether this modal should generate a fresh image or edit the last
   * companion photo. When the modal is opened from a content-policy refusal
   * the server sets this to "fresh" so a complaint message never accidentally
   * routes through the edit endpoint. When omitted, the server resolver picks.
   */
  initialMode?: "fresh" | "edit";
  onClose: () => void;
  onSuccess: (result: { url: string; type: ModalType; id: string }) => void;
}

const ASPECT_RATIOS = [
  { value: "portrait", label: "Portrait", desc: "9:16 vertical" },
  { value: "square", label: "Square", desc: "1:1" },
  { value: "landscape", label: "Landscape", desc: "16:9 horizontal" },
];

const IMAGE_STYLES = [
  "Animated realistic",
  "Anime-inspired adult",
  "3D animated",
  "Cinematic illustration",
  "Digital art",
];

const VIDEO_DURATIONS = [
  { value: "5", label: "5 seconds", cost: 30 },
  { value: "8", label: "8 seconds", cost: 45 },
  { value: "10", label: "10 seconds", cost: 60 },
];

function OptionPill({
  label,
  desc,
  selected,
  onClick,
}: {
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-sm text-left transition-all ${
        selected
          ? "border-purple-500 bg-purple-500/20 text-purple-300"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-white/25"
      }`}
    >
      <span className="font-medium">{label}</span>
      {desc && <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>}
    </button>
  );
}

export function MediaRequestModal({
  type,
  companionId,
  companionName,
  companionStyle,
  conversationId,
  initialRequest,
  initialAspectRatio,
  initialDuration,
  initialStyle,
  initialMode,
  onClose,
  onSuccess,
}: MediaRequestModalProps) {
  const [userRequest, setUserRequest] = useState(initialRequest ?? "");
  const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio ?? "portrait");
  const [style, setStyle] = useState(initialStyle ?? IMAGE_STYLES[0]);
  const [duration, setDuration] = useState<string>(initialDuration ?? "5");
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch estimated cost whenever relevant params change
  useEffect(() => {
    const fetchCost = async () => {
      try {
        const actionType =
          type === "image"
            ? "image_generate"
            : `video_generate_${duration}s`;
        const res = await fetch(`/api/billing/estimate?action=${actionType}`);
        if (res.ok) {
          const data = (await res.json()) as { cost: number };
          setEstimatedCost(data.cost);
        }
      } catch {
        // Fallback to static estimate
        setEstimatedCost(type === "image" ? 10 : duration === "10" ? 60 : duration === "8" ? 45 : 30);
      }
    };
    fetchCost();
  }, [type, duration]);

  const handleGenerate = async () => {
    if (!userRequest.trim()) { setError("Please describe your scene or request."); return; }
    setError(null);
    setLoading(true);

    try {
      const endpoint = type === "image" ? "/api/media/image" : "/api/media/video";
      const body =
        type === "image"
          ? {
              companionId,
              conversationId,
              userRequest: userRequest.trim(),
              aspectRatio,
              style,
              // Hard-pin the mode when the modal was opened from a policy
              // refusal so the resolver doesn't re-decide based on the text.
              ...(initialMode === "fresh" ? { forceFresh: true } : {}),
              ...(initialMode === "edit" ? { forceEdit: true } : {}),
            }
          : { companionId, conversationId, userRequest: userRequest.trim(), durationSeconds: duration, aspectRatio };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { url?: string; id?: string; status?: string; error?: string; code?: string };

      if (!res.ok) {
        if (data.code === "MODERATED") setError(data.error ?? "Request blocked by content policy.");
        else if (data.code === "INSUFFICIENT_CREDITS") setError("Not enough credits. Please top up your balance.");
        else setError(data.error ?? "Generation failed. Please try again.");
        return;
      }

      if (type === "image" && data.url && data.id) {
        onSuccess({ url: data.url, type: "image", id: data.id });
      } else if (type === "video" && data.id) {
        // Video is async — return job info so chat can poll
        onSuccess({ url: "", type: "video", id: data.id });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-[#0d0d1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Suggestion banner — shown when modal was opened from a policy bypass */}
        {initialRequest && (
          <div className="px-5 pt-4 pb-0">
            <div className="flex items-start gap-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 px-3.5 py-3 text-sm">
              <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-purple-300 font-medium leading-snug">Let me show you instead</p>
                <p className="text-purple-300/60 text-xs mt-0.5">
                  I&apos;ve pre-filled your request below — edit it however you like then hit Generate.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              {type === "image" ? (
                <ImageIcon className="w-4 h-4 text-purple-400" />
              ) : (
                <VideoIcon className="w-4 h-4 text-pink-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">
                Request {type === "image" ? "Image" : "Video"}
              </p>
              <p className="text-xs text-gray-400">{companionName} · {companionStyle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Scene request */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Describe the scene or request
            </label>
            <textarea
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              placeholder={
                type === "image"
                  ? "e.g. Sitting in a cozy café, reading a book, warm lighting…"
                  : "e.g. Walking through a field of flowers, gentle breeze…"
              }
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/8 resize-none transition-colors"
            />
            <p className="text-right text-xs text-gray-600 mt-1">{userRequest.length}/500</p>
          </div>

          {/* Image style (image only) */}
          {type === "image" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Style
              </label>
              <div className="flex flex-wrap gap-2">
                {IMAGE_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${
                      style === s
                        ? "border-purple-500 bg-purple-500/20 text-purple-300"
                        : "border-white/10 bg-white/5 text-gray-400 hover:border-white/25"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration (video only) */}
          {type === "video" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {VIDEO_DURATIONS.map((d) => (
                  <OptionPill
                    key={d.value}
                    label={d.label}
                    desc={`~${d.cost} credits`}
                    selected={duration === d.value}
                    onClick={() => setDuration(d.value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Aspect ratio */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ar) => (
                <OptionPill
                  key={ar.value}
                  label={ar.label}
                  desc={ar.desc}
                  selected={aspectRatio === ar.value}
                  onClick={() => setAspectRatio(ar.value)}
                />
              ))}
            </div>
          </div>

          {/* Cost estimate */}
          {estimatedCost !== null && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <p className="text-sm text-gray-300">
                Estimated cost:{" "}
                <span className="font-semibold text-purple-300">{estimatedCost} credits</span>
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <p className="text-xs text-gray-600 leading-relaxed">
            All generated content must be adult, fictional, and within our content policy. Tasteful and artistic only.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !userRequest.trim()}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {type === "video" ? "Submitting…" : "Generating…"}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
