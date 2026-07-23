"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check } from "lucide-react";

export type AutoMode = "off" | "ask" | "on";
export type AspectRatio = "portrait" | "square" | "landscape";

export interface MediaSettings {
  autoPics: AutoMode;
  autoVideos: AutoMode;
  defaultImageAspect: AspectRatio;
  defaultImageStyle?: string;
  defaultVideoAspect: AspectRatio;
  defaultVideoDuration: 5 | 8 | 10;
  defaultVideoMode: "from-last-photo" | "text-only";
}

interface Props {
  conversationId: string;
  type: "image" | "video";
  settings: MediaSettings;
  onSettingsChange: (next: MediaSettings) => void;
  onClose: () => void;
  anchorTo?: "top" | "bottom";
}

const ASPECT_OPTIONS: { value: AspectRatio; label: string; ratio: string }[] = [
  { value: "portrait", label: "Portrait", ratio: "9:16" },
  { value: "square", label: "Square", ratio: "1:1" },
  { value: "landscape", label: "Landscape", ratio: "16:9" },
];

const DURATION_OPTIONS: { value: 5 | 8 | 10; label: string; cost: number }[] = [
  { value: 5, label: "5s", cost: 30 },
  { value: 8, label: "8s", cost: 45 },
  { value: 10, label: "10s", cost: 60 },
];

const AUTO_LABELS: Record<AutoMode, { title: string; desc: string }> = {
  off: { title: "Off", desc: "Use the pills only — no surprises" },
  ask: { title: "Ask", desc: "Show a one-tap card when I drop a hint" },
  on: { title: "On", desc: "Auto-send right away when I ask" },
};

export function MediaSettingsPopover({
  conversationId,
  type,
  settings,
  onSettingsChange,
  onClose,
  anchorTo = "top",
}: Props) {
  const [local, setLocal] = useState<MediaSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const persist = async (next: MediaSettings) => {
    setLocal(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/${conversationId}/media-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data = (await res.json()) as { settings: MediaSettings };
        onSettingsChange(data.settings);
        setSavedAt(Date.now());
      }
    } catch {
      // network error — leave UI showing local value
    } finally {
      setSaving(false);
    }
  };

  const isImage = type === "image";
  const autoKey: keyof MediaSettings = isImage ? "autoPics" : "autoVideos";
  const aspectKey: keyof MediaSettings = isImage ? "defaultImageAspect" : "defaultVideoAspect";
  const auto = local[autoKey] as AutoMode;
  const aspect = local[aspectKey] as AspectRatio;

  return (
    <div
      ref={ref}
      className={`absolute z-50 ${
        anchorTo === "top" ? "bottom-full mb-2" : "top-full mt-2"
      } left-0 w-72 rounded-xl border border-white/10 bg-[#0d0d1a]/95 backdrop-blur-md shadow-2xl shadow-black/40`}
      role="dialog"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {isImage ? "Image" : "Video"} settings
        </p>
        <div className="flex items-center gap-2">
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
          ) : savedAt && Date.now() - savedAt < 2000 ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : null}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Auto-mode segmented */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">
            When I {isImage ? "ask for a pic" : "ask for a video"}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(AUTO_LABELS) as AutoMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => persist({ ...local, [autoKey]: mode })}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  auto === mode
                    ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                {AUTO_LABELS[mode].title}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
            {AUTO_LABELS[auto].desc}
          </p>
        </div>

        {/* Aspect ratio */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Aspect ratio</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => persist({ ...local, [aspectKey]: o.value })}
                className={`px-2 py-1.5 rounded-lg text-xs transition-all ${
                  aspect === o.value
                    ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="block font-medium">{o.label}</span>
                <span className="block text-[10px] text-gray-500">{o.ratio}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Video-only: duration + source */}
        {!isImage && (
          <>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Duration</p>
              <div className="grid grid-cols-3 gap-1.5">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => persist({ ...local, defaultVideoDuration: o.value })}
                    className={`px-2 py-1.5 rounded-lg text-xs transition-all ${
                      local.defaultVideoDuration === o.value
                        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                        : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-[10px] text-gray-500">~{o.cost} cr</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">Source</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: "from-last-photo" as const, label: "Last photo", desc: "Animate it" },
                  { value: "text-only" as const, label: "Fresh", desc: "From text" },
                ].map((o) => (
                  <button
                    key={o.value}
                    onClick={() => persist({ ...local, defaultVideoMode: o.value })}
                    className={`px-2 py-1.5 rounded-lg text-xs text-left transition-all ${
                      local.defaultVideoMode === o.value
                        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                        : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-[10px] text-gray-500">{o.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="text-[11px] text-gray-600 leading-snug border-t border-white/5 pt-2.5">
          Saved for this chat. New conversations use your companion&apos;s defaults.
        </p>
      </div>
    </div>
  );
}
