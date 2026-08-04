"use client";
import { cn } from "@/shared/presentation/utils";
import { MEDIA_COSTS } from "@/config/media";
import { MessageSquare, ImageIcon, Video } from "lucide-react";

type ComposerMode = "chat" | "image" | "video";

interface Props {
  readonly activeMode: ComposerMode;
  readonly onModeChange: (mode: ComposerMode) => void;
  readonly videoEnabled: boolean;
}

/**
 * ComposerModePills — the three tappable pills above the text composer.
 * Matches the design in the reference screenshots (Chat, Image · 10, Video · 50).
 *
 * These do not submit a generation — they prime the composer mode so that
 * when the user taps Send, the intent-classifier result is overridden with
 * the explicitly chosen mode.
 */
export function ComposerModePills({ activeMode, onModeChange, videoEnabled }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <ModePill
        active={activeMode === "chat"}
        onClick={() => onModeChange("chat")}
        label="Chat"
        icon={<MessageSquare className="h-3 w-3" />}
        accent="pink"
      />
      <ModePill
        active={activeMode === "image"}
        onClick={() => onModeChange("image")}
        label={`Image · ${MEDIA_COSTS.IMAGE}`}
        icon={<ImageIcon className="h-3 w-3" />}
        accent="pink"
      />
      {videoEnabled ? (
        <ModePill
          active={activeMode === "video"}
          onClick={() => onModeChange("video")}
          label={`Video · ${MEDIA_COSTS.VIDEO}`}
          icon={<Video className="h-3 w-3" />}
          accent="violet"
        />
      ) : null}
    </div>
  );
}

function ModePill({
  active,
  onClick,
  label,
  icon,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  accent: "pink" | "violet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? accent === "violet"
            ? "bg-violet-500/20 text-violet-300"
            : "bg-pink-500/20 text-pink-300"
          : "bg-[#1a1a22] text-[#8a8a99] hover:bg-[#252530] hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
