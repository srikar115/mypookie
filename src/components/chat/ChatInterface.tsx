"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Send,
  Coins,
  AlertTriangle,
  Brain,
  ChevronLeft,
  Settings2,
  ImageIcon,
  VideoIcon,
  Paperclip,
  Camera,
  X,
  RotateCcw,
  Trash2,
  BookOpen,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaRequestModal } from "./MediaRequestModal";
import { MediaSettingsPopover, type MediaSettings } from "./MediaSettingsPopover";

const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  autoPics: "ask",
  autoVideos: "off",
  defaultImageAspect: "portrait",
  defaultImageStyle: undefined,
  defaultVideoAspect: "portrait",
  defaultVideoDuration: 5,
  defaultVideoMode: "from-last-photo",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date | string;
  isStreaming?: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaGenerationId?: string;
  /**
   * Where the generated image came from. Populated only when this message
   * is an assistant image produced via WAN image-edit (i.e. a prior photo
   * or a user selfie was used as a reference). Used to render a subtle
   * "edit of last photo" badge in the bubble — builds visual-continuity trust.
   */
  referenceSource?: "user-attachment" | "last-companion-photo" | "user+companion" | "none";
}

export interface ChatInterfaceProps {
  companion: {
    id: string;
    name: string;
    companionType: string;
    overallVibe?: string;
    visualStyle?: string;
    systemPrompt: string;
    avatarUrl?: string | null;
  };
  conversation: { id: string };
  initialMessages: ChatMessage[];
  memory: string;
  credits: number;
  creditCostPerMessage?: number;
}

// Limits for attachments
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/mov", "video/quicktime"];

// ─── Attachment types ─────────────────────────────────────────────────────────

interface PendingAttachment {
  type: "image" | "video";
  file: File;
  previewUrl: string; // Object URL for display
}

// ─── New Chat confirmation panel ─────────────────────────────────────────────

function NewChatPanel({
  companionName,
  conversationId,
  onCancel,
  onReset,
}: {
  companionName: string;
  conversationId: string;
  onCancel: () => void;
  onReset: (mode: "soft" | "hard", greeting: ChatMessage, newConversationId: string) => void;
}) {
  const [loading, setLoading] = useState<"soft" | "hard" | null>(null);
  const [error, setError] = useState("");

  const doReset = async (mode: "soft" | "hard") => {
    setLoading(mode);
    setError("");
    try {
      const res = await fetch(`/api/chat/${conversationId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Reset failed");
      const data = await res.json();
      onReset(mode, {
        id: data.greeting.id,
        role: "ASSISTANT",
        content: data.greeting.content,
        createdAt: data.greeting.createdAt,
      }, data.conversationId);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a0f]/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-[#2a2a3d] bg-[#0e0e1a] shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-[#2a2a3d]">
          <h3 className="font-semibold text-[#f1f0ff]">Start a new chat?</h3>
          <p className="text-xs text-[#6b7280] mt-0.5">
            The current conversation window will be cleared.
          </p>
        </div>

        <div className="p-3 space-y-2">
          {/* Soft reset */}
          <button
            type="button"
            onClick={() => doReset("soft")}
            disabled={!!loading}
            className="w-full flex items-start gap-3 p-4 rounded-xl border border-[#2e2818] bg-[#12100a] hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-left disabled:opacity-50"
          >
            <BookOpen className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#f1f0ff]">Keep memories, start fresh</p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                New conversation window — {companionName} still remembers everything about you.
              </p>
            </div>
            {loading === "soft" && (
              <svg className="h-4 w-4 animate-spin text-amber-400 shrink-0 ml-auto mt-0.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </button>

          {/* Hard reset */}
          <button
            type="button"
            onClick={() => doReset("hard")}
            disabled={!!loading}
            className="w-full flex items-start gap-3 p-4 rounded-xl border border-[#2a2a3d] bg-[#12121a] hover:border-red-500/30 hover:bg-red-500/5 transition-all text-left disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#f1f0ff]">Forget everything &amp; start over</p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                Clears the window and resets all memories — like meeting for the first time.
              </p>
            </div>
            {loading === "hard" && (
              <svg className="h-4 w-4 animate-spin text-red-400 shrink-0 ml-auto mt-0.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </button>
        </div>

        {error && (
          <p className="px-5 pb-3 text-xs text-red-400">{error}</p>
        )}

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={!!loading}
            className="w-full py-2.5 text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors rounded-xl hover:bg-[#1a1a26] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  companionName,
  avatarUrl,
}: {
  message: ChatMessage;
  companionName: string;
  avatarUrl?: string | null;
}) {
  const isUser = message.role === "USER";

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && <CompanionAvatar avatarUrl={avatarUrl} name={companionName} />}

      <div
        className={cn(
          "max-w-[75%] sm:max-w-[60%] rounded-2xl text-sm leading-relaxed break-words overflow-hidden",
          isUser
            ? "bg-gradient-to-br from-amber-500 to-rose-500 text-white rounded-tr-sm"
            : "bg-[#1a1610] border border-[#2e2818] text-[#fff8ee] rounded-tl-sm"
        )}
      >
        {/* Generated media (from companion) */}
        {message.mediaUrl && message.mediaType === "image" && (
          <div className="relative overflow-hidden">
            <Image
              src={message.mediaUrl}
              alt="Image"
              width={400}
              height={400}
              className="w-full max-w-xs object-cover"
              unoptimized
            />
            {message.referenceSource && message.referenceSource !== "none" && (
              <span
                className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white/90 bg-black/55 backdrop-blur-sm border border-white/10 leading-none flex items-center gap-1"
                title={
                  message.referenceSource === "user-attachment"
                    ? "Generated using your photo"
                    : message.referenceSource === "user+companion"
                    ? "Generated with your selfie and her last photo"
                    : "Edit of her last photo"
                }
              >
                <ImageIcon className="h-2.5 w-2.5" />
                {message.referenceSource === "user-attachment"
                  ? "from your selfie"
                  : message.referenceSource === "user+companion"
                  ? "with you"
                  : "edited"}
              </span>
            )}
          </div>
        )}
        {message.mediaUrl && message.mediaType === "video" && (
          <div className="overflow-hidden">
            <video
              src={message.mediaUrl}
              controls
              className="w-full max-w-xs"
              playsInline
            />
          </div>
        )}
        <div className="px-4 py-2.5">
          {/* Hide the internal 📸/🎬 scene label for media-only messages */}
          {message.mediaUrl && /^[📸🎬]/.test(message.content ?? "")
            ? null
            : message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-amber-300 rounded-sm ml-0.5 animate-pulse" />
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1610] border border-[#2e2818] text-xs font-semibold text-[#6b7280] mt-0.5">
          You
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  return (
    <div className="flex gap-3 animate-fade-in">
      <CompanionAvatar avatarUrl={avatarUrl} name={name} />
      <div className="bg-[#1a1610] border border-[#2e2818] rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Shared companion avatar ──────────────────────────────────────────────────

function CompanionAvatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-base shadow-md mt-0.5 overflow-hidden">
      {avatarUrl ? (
        <Image src={avatarUrl} alt={name} width={32} height={32} className="h-8 w-8 object-cover" unoptimized />
      ) : "✨"}
    </div>
  );
}

// ─── Playful media-generating bubble ─────────────────────────────────────────

const IMAGE_PHRASES = [
  (name: string) => `${name} is picking the perfect outfit for you... 👗`,
  (name: string) => `${name} is striking a pose just for you... 📸`,
  (name: string) => `${name} is getting camera-ready...`,
  (name: string) => `Setting the scene for ${name}... ✨`,
  (name: string) => `${name} says "give me a sec!" 😊`,
  (name: string) => `Capturing ${name}'s best angle...`,
  (name: string) => `${name} is touching up before the shot... 💄`,
  (name: string) => `The lighting has to be perfect for ${name}...`,
];

const VIDEO_PHRASES = [
  (name: string) => `${name} is warming up for you... 🎬`,
  (name: string) => `Rolling the camera for ${name}...`,
  (name: string) => `${name} says "3, 2, 1..."`,
  (name: string) => `${name} is rehearsing her lines... 😄`,
  (name: string) => `Filming something special from ${name}...`,
];

function MediaGeneratingBubble({
  companionName,
  avatarUrl,
  mediaType = "image",
}: {
  companionName: string;
  avatarUrl?: string | null;
  mediaType?: "image" | "video";
}) {
  const phrases = mediaType === "video" ? VIDEO_PHRASES : IMAGE_PHRASES;
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * phrases.length)
  );

  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % phrases.length);
    }, 2800);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div className="flex gap-3 animate-fade-in">
      <CompanionAvatar avatarUrl={avatarUrl} name={companionName} />

      <div className="bg-[#1a1610] border border-[#2e2818] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[75%] sm:max-w-[60%]">
        {/* Shimmer progress bar */}
        <div className="w-full h-1 rounded-full bg-[#2e2818] overflow-hidden mb-2.5">
          <div className="h-full bg-gradient-to-r from-amber-500 to-rose-400 rounded-full animate-[shimmer_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
        </div>

        {/* Rotating phrase */}
        <p className="text-xs text-[#e5d5b8] leading-relaxed transition-all duration-500">
          {phrases[phraseIdx](companionName)}
        </p>

        {/* Pulsing dots */}
        <div className="flex gap-1 mt-2">
          <span className="w-1 h-1 rounded-full bg-amber-400/70 animate-bounce [animation-delay:0ms]" />
          <span className="w-1 h-1 rounded-full bg-amber-400/70 animate-bounce [animation-delay:150ms]" />
          <span className="w-1 h-1 rounded-full bg-amber-400/70 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Inline "media unaffordable" card ────────────────────────────────────────

function MediaUnaffordableCard({
  mediaType,
  required,
  remaining,
  onDismiss,
}: {
  mediaType: "image" | "video";
  required: number;
  remaining: number;
  onDismiss: () => void;
}) {
  const shortBy = Math.max(0, required - remaining);
  return (
    <div className="ml-11 mt-1 max-w-[75%] sm:max-w-[60%] animate-fade-in">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Coins className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200 leading-snug">
            Top up to send {mediaType === "video" ? "a video" : "a photo"}
            {shortBy > 0 && (
              <span className="text-amber-300/70"> · need {shortBy} more credit{shortBy === 1 ? "" : "s"}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link href="/app/billing">
            <Button size="sm" className="h-7 text-xs px-2.5">Top Up</Button>
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-300/60 hover:text-amber-200 transition-colors p-1"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline "Send pic?" suggestion card (ask-mode) ───────────────────────────

function MediaSuggestionCard({
  mediaType,
  scene,
  required,
  remaining,
  submitting,
  onSend,
  onEdit,
  onDismiss,
}: {
  mediaType: "image" | "video";
  scene: string;
  required: number;
  remaining: number;
  submitting: boolean;
  onSend: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const canAfford = remaining >= required;
  return (
    <div className="ml-11 mt-1 max-w-[80%] sm:max-w-[65%] animate-fade-in">
      <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/5 to-rose-500/5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {mediaType === "image" ? (
              <ImageIcon className="h-3.5 w-3.5 text-amber-300 shrink-0" />
            ) : (
              <VideoIcon className="h-3.5 w-3.5 text-rose-300 shrink-0" />
            )}
            <p className="text-xs font-medium text-amber-200">
              Send {mediaType === "image" ? "a pic" : "a clip"}?
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-300/50 hover:text-amber-200 transition-colors -m-1 p-1"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        {scene && (
          <p className="text-xs text-amber-100/80 leading-snug line-clamp-2 mb-2 italic">
            &ldquo;{scene}&rdquo;
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-300/60">
            ~{required} credit{required === 1 ? "" : "s"} · {remaining} left
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              disabled={submitting}
              className="px-2.5 py-1 rounded-md text-[11px] text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              Edit
            </button>
            {canAfford ? (
              <button
                type="button"
                onClick={onSend}
                disabled={submitting}
                className="px-3 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-1"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sending…
                  </>
                ) : (
                  `Send ${mediaType === "image" ? "pic" : "clip"}`
                )}
              </button>
            ) : (
              <Link href="/app/billing">
                <button
                  type="button"
                  className="px-3 py-1 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                >
                  Top up
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attachment preview ───────────────────────────────────────────────────────

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="relative inline-block mb-2">
      {attachment.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt="attachment preview"
          className="h-20 w-20 object-cover rounded-lg border border-[#2a2a3d]"
        />
      ) : (
        <div className="h-20 w-32 flex flex-col items-center justify-center rounded-lg border border-[#2a2a3d] bg-[#1a1a26] text-[#6b7280] gap-1 text-xs">
          <VideoIcon className="h-6 w-6 text-pink-400" />
          <span className="truncate max-w-[7rem] px-1">{attachment.file.name}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[#0a0a0f] border border-[#3a3a50] flex items-center justify-center text-[#6b7280] hover:text-white transition-colors"
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STREAM_ASSISTANT_ID = "__streaming__";

export function ChatInterface({
  companion,
  conversation,
  initialMessages,
  credits: initialCredits,
  creditCostPerMessage = 1,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "streaming" | "error">("idle");
  const [credits, setCredits] = useState(initialCredits);
  const [alertState, setAlertState] = useState<{
    type: "error" | "moderated" | "no_credits" | null;
    message: string;
  }>({ type: null, message: "" });
  const [mediaModal, setMediaModal] = useState<"image" | "video" | null>(null);
  const [imageSuggestionPrompt, setImageSuggestionPrompt] = useState<string | null>(null);
  const [imageSuggestionMode, setImageSuggestionMode] = useState<"fresh" | "edit" | null>(null);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [generatingMediaType, setGeneratingMediaType] = useState<"image" | "video">("image");
  // Server signals when the user asked for media but can't afford it — we
  // show an inline "Top Up" CTA under the latest assistant reply. Cleared on
  // navigation, send, or dismissal.
  const [unaffordableHint, setUnaffordableHint] = useState<{
    mediaType: "image" | "video";
    required: number;
    remaining: number;
  } | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  // Track current conversation ID (changes after reset)
  const [currentConversationId, setCurrentConversationId] = useState(conversation.id);

  // Per-conversation media settings (autoPics, aspect, video defaults).
  // Loaded once from the server; mutations are persisted via the popover.
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(DEFAULT_MEDIA_SETTINGS);
  const [settingsPopover, setSettingsPopover] = useState<"image" | "video" | null>(null);

  // Suggestion cards from ask-mode (one card per assistant reply that
  // triggered a media intent). Keyed by message id so we can dismiss
  // independently and clear stale ones on reset.
  const [mediaSuggestion, setMediaSuggestion] = useState<{
    mediaType: "image" | "video";
    scene: string;
    creditsRequired: number;
    creditsRemaining: number;
  } | null>(null);
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);

  // First-run media intro pulse on the Image pill. Gated by localStorage so
  // we show it once per browser, never again. Auto-hides on first click or
  // after 12s so it doesn't linger forever.
  const [showMediaIntro, setShowMediaIntro] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem("mediaIntroSeenV1");
      if (!seen) {
        setShowMediaIntro(true);
        const timer = window.setTimeout(() => {
          setShowMediaIntro(false);
          try { window.localStorage.setItem("mediaIntroSeenV1", "1"); } catch { /* ignore */ }
        }, 12000);
        return () => window.clearTimeout(timer);
      }
    } catch {
      /* private mode etc — silently skip */
    }
  }, []);
  const dismissMediaIntro = useCallback(() => {
    setShowMediaIntro(false);
    try { window.localStorage.setItem("mediaIntroSeenV1", "1"); } catch { /* ignore */ }
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Cleanup
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load media settings whenever the active conversation changes (e.g. after
  // a New Chat reset). Failures fall back to client defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat/${currentConversationId}/media-settings`);
        if (!res.ok) return;
        const data = (await res.json()) as { settings: MediaSettings };
        if (!cancelled) setMediaSettings(data.settings);
      } catch {
        /* fall back to defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentConversationId]);

  // ── Video job polling ───────────────────────────────────────────────────────
  // Each queued video has a placeholder message with `mediaGenerationId` but
  // no `mediaUrl` yet. Poll /api/media/jobs/[id] every 4s for every such
  // placeholder until it resolves to "completed" or "failed". When complete,
  // swap the placeholder for a real video bubble. Cap retries per job so a
  // stuck job doesn't hammer the server forever.
  const pendingVideoJobsRef = useRef<Map<string, { attempts: number; lastPoll: number }>>(
    new Map()
  );
  useEffect(() => {
    const pendingIds = messages
      .filter((m) => m.mediaGenerationId && !m.mediaUrl && m.id.startsWith("video_"))
      .map((m) => m.mediaGenerationId!)
      .filter((id, i, a) => a.indexOf(id) === i);

    if (pendingIds.length === 0) return;

    const MAX_ATTEMPTS = 90; // 90 * 4s = 6 minutes — generous for WAN i2v
    const POLL_MS = 4000;
    let cancelled = false;

    const pollOnce = async () => {
      for (const id of pendingIds) {
        const state = pendingVideoJobsRef.current.get(id) ?? { attempts: 0, lastPoll: 0 };
        if (state.attempts >= MAX_ATTEMPTS) continue;
        if (Date.now() - state.lastPoll < POLL_MS - 200) continue;

        state.attempts++;
        state.lastPoll = Date.now();
        pendingVideoJobsRef.current.set(id, state);

        try {
          const res = await fetch(`/api/media/jobs/${id}`);
          if (!res.ok) continue;
          const data = (await res.json()) as {
            status?: string;
            resultUrl?: string;
            errorMessage?: string;
          };

          if (cancelled) return;

          if (data.status === "completed" && data.resultUrl) {
            setMessages((prev) =>
              prev.map((m) =>
                m.mediaGenerationId === id && !m.mediaUrl
                  ? {
                      ...m,
                      content: "Here it is.",
                      mediaUrl: data.resultUrl,
                      mediaType: "video" as const,
                    }
                  : m
              )
            );
            pendingVideoJobsRef.current.delete(id);
          } else if (data.status === "failed") {
            setMessages((prev) =>
              prev.map((m) =>
                m.mediaGenerationId === id && !m.mediaUrl
                  ? {
                      ...m,
                      content:
                        "Hmm, my video didn't render this time — your credits are refunded. Want me to try again?",
                    }
                  : m
              )
            );
            pendingVideoJobsRef.current.delete(id);
          }
        } catch {
          // Network blip — leave the poll loop running.
        }
      }
    };

    pollOnce();
    const interval = window.setInterval(pollOnce, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [messages]);

  const clearAlert = () => setAlertState({ type: null, message: "" });

  const handleChatReset = useCallback((_mode: "soft" | "hard", greeting: ChatMessage, newConversationId: string) => {
    setMessages([greeting]);
    setCurrentConversationId(newConversationId);
    setShowNewChat(false);
    setInput("");
    setAttachment(null);
    setUnaffordableHint(null);
    setMediaSuggestion(null);
    clearAlert();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Attachment selection ──────────────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target.files) return;
    e.target.value = ""; // reset so the same file can be re-selected

    if (!file) return;

    const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
    const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type) || file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setAlertState({ type: "error", message: "Only image and video files are supported." });
      return;
    }

    if (isImage && file.size > MAX_IMAGE_BYTES) {
      setAlertState({ type: "error", message: "Image must be under 4 MB." });
      return;
    }

    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      setAlertState({ type: "error", message: "Video must be under 100 MB." });
      return;
    }

    // Revoke previous preview
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);

    setAttachment({
      type: isImage ? "image" : "video",
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }, [attachment]);

  const removeAttachment = useCallback(() => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }, [attachment]);

  // Selfie handler — same as regular image but opens camera on mobile
  const handleSelfieSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target.files) return;
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setAlertState({ type: "error", message: "Image must be under 4 MB." });
      return;
    }
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment({ type: "image", file, previewUrl: URL.createObjectURL(file) });
  }, [attachment]);

  // ── Media generation callback ─────────────────────────────────────────────
  const handleMediaSuccess = useCallback(
    (result: { url: string; type: "image" | "video"; id: string }) => {
      setMediaModal(null);
      setImageSuggestionPrompt(null);
      setImageSuggestionMode(null);
      if (result.type === "image" && result.url) {
        setMessages((prev) => [
          ...prev,
          {
            id: `media_${result.id}`,
            role: "ASSISTANT",
            content: "",
            createdAt: new Date(),
            mediaUrl: result.url,
            mediaType: "image" as const,
          },
        ]);
      } else if (result.type === "video") {
        setMessages((prev) => [
          ...prev,
          {
            id: `media_${result.id}`,
            role: "ASSISTANT",
            content: "Your video is being generated! I'll have it ready for you shortly.",
            createdAt: new Date(),
            mediaGenerationId: result.id,
          },
        ]);
      }
    },
    []
  );

  // ── Ask-mode: user accepted the inline "Send pic?" suggestion ─────────────
  const handleAcceptSuggestion = useCallback(async () => {
    if (!mediaSuggestion || submittingSuggestion) return;
    setSubmittingSuggestion(true);
    clearAlert();
    try {
      if (mediaSuggestion.mediaType === "image") {
        setIsGeneratingMedia(true);
        setGeneratingMediaType("image");
        const res = await fetch("/api/media/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companionId: companion.id,
            conversationId: currentConversationId,
            userRequest: mediaSuggestion.scene,
            aspectRatio: mediaSettings.defaultImageAspect,
          }),
        });
        const data = (await res.json()) as {
          id?: string;
          url?: string;
          error?: string;
          code?: string;
          remainingCredits?: number;
          referenceSource?: ChatMessage["referenceSource"];
        };
        if (!res.ok) {
          if (data.code === "INSUFFICIENT_CREDITS") {
            setAlertState({ type: "no_credits", message: "Not enough credits." });
          } else {
            setAlertState({ type: "error", message: data.error ?? "Generation failed." });
          }
          return;
        }
        if (data.url && data.id) {
          setMessages((prev) => [
            ...prev,
            {
              id: `media_${data.id}`,
              role: "ASSISTANT",
              content: "",
              createdAt: new Date(),
              mediaUrl: data.url,
              mediaType: "image" as const,
              referenceSource: data.referenceSource ?? undefined,
            },
          ]);
          if (typeof data.remainingCredits === "number") setCredits(data.remainingCredits);
        }
      } else {
        // Video — submit to /api/media/video and let the polling effect resolve it.
        const res = await fetch("/api/media/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companionId: companion.id,
            conversationId: currentConversationId,
            userRequest: mediaSuggestion.scene,
            durationSeconds: String(mediaSettings.defaultVideoDuration),
            aspectRatio: mediaSettings.defaultVideoAspect,
            mode: mediaSettings.defaultVideoMode,
          }),
        });
        const data = (await res.json()) as {
          id?: string; error?: string; code?: string; remainingCredits?: number;
        };
        if (!res.ok) {
          if (data.code === "INSUFFICIENT_CREDITS") {
            setAlertState({ type: "no_credits", message: "Not enough credits." });
          } else {
            setAlertState({ type: "error", message: data.error ?? "Video generation failed." });
          }
          return;
        }
        if (data.id) {
          setMessages((prev) => [
            ...prev,
            {
              id: `video_${data.id}`,
              role: "ASSISTANT",
              content: "Your video is generating — I'll have it ready for you shortly!",
              createdAt: new Date(),
              mediaGenerationId: data.id,
            },
          ]);
          if (typeof data.remainingCredits === "number") setCredits(data.remainingCredits);
        }
      }
      setMediaSuggestion(null);
    } catch {
      setAlertState({ type: "error", message: "Generation failed. Please try again." });
    } finally {
      setSubmittingSuggestion(false);
      setIsGeneratingMedia(false);
    }
  }, [
    mediaSuggestion,
    submittingSuggestion,
    companion.id,
    currentConversationId,
    mediaSettings.defaultImageAspect,
    mediaSettings.defaultVideoAspect,
    mediaSettings.defaultVideoDuration,
    mediaSettings.defaultVideoMode,
  ]);

  // ── Quick-generate: one-tap image from conversation context ───────────────
  const handleQuickImage = useCallback(async () => {
    if (isGeneratingMedia || status !== "idle") return;
    setIsGeneratingMedia(true);
    setGeneratingMediaType("image");
    clearAlert();
    try {
      const res = await fetch("/api/media/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companionId: companion.id,
          conversationId: currentConversationId,
          quickGenerate: true,
          aspectRatio: "portrait",
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        url?: string;
        error?: string;
        code?: string;
        remainingCredits?: number;
        referenceSource?: ChatMessage["referenceSource"];
      };
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_CREDITS") {
          setAlertState({ type: "no_credits", message: "Not enough credits to generate an image." });
        } else {
          setAlertState({ type: "error", message: data.error ?? "Image generation failed." });
        }
        return;
      }
      if (data.url && data.id) {
        setMessages((prev) => [
          ...prev,
          {
            id: `media_${data.id}`,
            role: "ASSISTANT",
            content: "",
            createdAt: new Date(),
            mediaUrl: data.url,
            mediaType: "image" as const,
            referenceSource: data.referenceSource ?? undefined,
          },
        ]);
        if (typeof data.remainingCredits === "number") {
          setCredits(data.remainingCredits);
        }
      }
    } catch {
      setAlertState({ type: "error", message: "Image generation failed. Please try again." });
    } finally {
      setIsGeneratingMedia(false);
    }
  }, [companion.id, currentConversationId, isGeneratingMedia, status]);

  const isIdle = status === "idle";
  const canSend =
    isIdle && (input.trim().length > 0 || !!attachment) && credits >= creditCostPerMessage;

  // ── Send handler ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!isIdle || credits < creditCostPerMessage) return;
    const content = input.trim();
    if (!content && !attachment) return;

    setInput("");
    clearAlert();
    setUnaffordableHint(null);
    setMediaSuggestion(null);

    const pendingAttachment = attachment;
    setAttachment(null);

    // NOTE: do NOT set isGeneratingMedia here based on client-side regex —
    // the server's done event includes mediaWillFollow which is authoritative.

    const tempUserId = `temp-${Date.now()}`;

    // Optimistic user message
    const optimisticMsg: ChatMessage = {
      id: tempUserId,
      role: "USER",
      content: content || (pendingAttachment?.type === "image" ? "📷 Shared an image" : "🎥 Shared a video"),
      createdAt: new Date(),
      // Show local preview immediately for images
      ...(pendingAttachment?.type === "image"
        ? { mediaUrl: pendingAttachment.previewUrl, mediaType: "image" as const }
        : {}),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setStatus("sending");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // For images: encode to base64 data URL to persist across sessions
      let attachmentDataUrl: string | undefined;
      if (pendingAttachment?.type === "image") {
        attachmentDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pendingAttachment.file);
        });
      }

      const res = await fetch(`/api/chat/${currentConversationId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(pendingAttachment
            ? {
                attachmentType: pendingAttachment.type,
                attachmentName: pendingAttachment.file.name,
                ...(attachmentDataUrl ? { attachmentDataUrl } : {}),
              }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let errMsg = "Something went wrong.";
        let alertType: typeof alertState.type = "error";
        try {
          const text = await res.text();
          const jsonMatch = text.match(/data: ({.*})/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : null;
          errMsg = parsed?.error ?? errMsg;
          if (res.status === 422) alertType = "moderated";
          if (res.status === 402) alertType = "no_credits";
        } catch { /* ignore */ }
        setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
        setAlertState({ type: alertType, message: errMsg });
        setStatus("idle");
        return;
      }

      setStatus("streaming");

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== STREAM_ASSISTANT_ID),
        {
          id: STREAM_ASSISTANT_ID,
          role: "ASSISTANT",
          content: "",
          createdAt: new Date(),
          isStreaming: true,
        },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let realUserMsgId = tempUserId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(trimmed.slice(6)); }
          catch { continue; }

          switch (event.type) {
            case "user_saved":
              realUserMsgId = event.messageId as string;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempUserId
                    ? {
                        ...m,
                        id: realUserMsgId,
                        // Replace blob preview URL with persisted data URL
                        ...(attachmentDataUrl ? { mediaUrl: attachmentDataUrl } : {}),
                      }
                    : m
                )
              );
              break;

            case "token":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === STREAM_ASSISTANT_ID
                    ? { ...m, content: m.content + (event.content as string) }
                    : m
                )
              );
              break;

            case "done":
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === STREAM_ASSISTANT_ID)
                    return { ...m, id: event.assistantMessageId as string, isStreaming: false };
                  if (m.id === tempUserId)
                    return { ...m, id: realUserMsgId };
                  return m;
                })
              );
              setCredits(event.creditsRemaining as number);
              // Only show the generating spinner if the server actually started media gen
              if (event.mediaWillFollow) {
                setIsGeneratingMedia(true);
                setGeneratingMediaType("image");
              }
              break;

            case "media_result":
              setIsGeneratingMedia(false);
              if (event.mediaType === "image" && event.url) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: (event.messageId as string) ?? `media_${Date.now()}`,
                    role: "ASSISTANT",
                    content: "",
                    createdAt: new Date(),
                    mediaUrl: event.url as string,
                    mediaType: "image",
                    referenceSource:
                      (event.referenceSource as ChatMessage["referenceSource"]) ?? undefined,
                  },
                ]);
                if (typeof event.creditsUsed === "number") {
                  setCredits((c) => Math.max(0, c - (event.creditsUsed as number)));
                }
              }
              break;

            case "media_error":
              setIsGeneratingMedia(false);
              break;

            case "moderated":
              setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserId && m.id !== STREAM_ASSISTANT_ID)
              );
              setAlertState({
                type: "moderated",
                message: (event.error as string) ?? "Message blocked by moderation.",
              });
              break;

            case "insufficient_credits":
              setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserId && m.id !== STREAM_ASSISTANT_ID)
              );
              setAlertState({ type: "no_credits", message: "Insufficient credits." });
              setCredits((event.creditsRemaining as number) ?? 0);
              break;

            case "error":
              setMessages((prev) =>
                prev.filter((m) => m.id !== tempUserId && m.id !== STREAM_ASSISTANT_ID)
              );
              setAlertState({
                type: "error",
                message: (event.error as string) ?? "An error occurred.",
              });
              break;

            case "video_queued":
              // Video job submitted — show a placeholder message so user sees it's generating
              setIsGeneratingMedia(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: `video_${event.mediaGenerationId as string}`,
                  role: "ASSISTANT",
                  content: "Your video is generating — I'll have it ready for you shortly!",
                  createdAt: new Date(),
                  mediaGenerationId: event.mediaGenerationId as string,
                },
              ]);
              break;

            case "image_suggestion":
              // LLM refused — open the media modal pre-filled with the
              // CLEANED scene the server extracted (router or regex). The
              // forceMode tells the modal whether to ask /api/media/image
              // for a fresh image or an edit of the previous photo.
              setMessages((prev) =>
                prev.filter((m) => m.id !== STREAM_ASSISTANT_ID)
              );
              setImageSuggestionPrompt((event.prompt as string) ?? "");
              setImageSuggestionMode(
                event.forceMode === "edit" || event.forceMode === "fresh"
                  ? (event.forceMode as "fresh" | "edit")
                  : "fresh"
              );
              setMediaModal("image");
              break;

            case "media_unaffordable":
              // Router detected user wants media but balance is too low. We do
              // not block the chat reply — the system note injection makes the
              // companion gracefully acknowledge it in-character. We just
              // surface an inline Top Up CTA under the reply.
              setUnaffordableHint({
                mediaType: (event.mediaType as "image" | "video") ?? "image",
                required: (event.creditsRequired as number) ?? 0,
                remaining: (event.creditsRemaining as number) ?? 0,
              });
              break;

            case "media_suggestion":
              // Ask-mode: router detected a media intent but per-conversation
              // setting says "ask first". Show an inline Send-pic card under
              // the assistant reply with the extracted scene + cost preview.
              setMediaSuggestion({
                mediaType: (event.mediaType as "image" | "video") ?? "image",
                scene: (event.scene as string) ?? "",
                creditsRequired: (event.creditsRequired as number) ?? 0,
                creditsRemaining: (event.creditsRemaining as number) ?? 0,
              });
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempUserId && m.id !== STREAM_ASSISTANT_ID)
      );
      setAlertState({ type: "error", message: "Connection failed. Please try again." });
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === STREAM_ASSISTANT_ID ? { ...m, isStreaming: false } : m
        )
      );
      setIsGeneratingMedia(false);
      setStatus("idle");
      abortRef.current = null;
      textareaRef.current?.focus();
      // Revoke the blob URL now that we have the persisted data URL
      if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, attachment, isIdle, credits, creditCostPerMessage, conversation.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) handleSend();
    }
  };

  const isStreaming = status === "streaming";
  const isSending = status === "sending" || isStreaming;

  return (
    <div className="relative flex flex-col h-full bg-[#0a0a0f]">
      {/* New Chat overlay */}
      {showNewChat && (
        <NewChatPanel
          companionName={companion.name}
          conversationId={currentConversationId}
          onCancel={() => setShowNewChat(false)}
          onReset={handleChatReset}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#2a2a3d] bg-[#0c0c14] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/app/companions">
            <button
              className="text-[#6b7280] hover:text-[#c4c2d4] transition-colors p-1 -ml-1"
              aria-label="Back to companions"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Link>
          <div className="relative h-9 w-9 shrink-0">
            {companion.avatarUrl ? (
              <Image
                src={companion.avatarUrl}
                alt={companion.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover shadow"
                unoptimized
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-lg shadow">
                ✨
              </div>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-[#f1f0ff] text-sm leading-tight">
              {companion.name}
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-[#6b7280]">{companion.companionType}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/app/billing">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
                credits < 5
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-[#1a1a26] border-[#2a2a3d] hover:border-[#3a3a50]"
              )}
            >
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className={cn("text-xs font-semibold", credits < 5 ? "text-amber-300" : "text-[#f1f0ff]")}>
                {credits.toLocaleString()}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            disabled={!isIdle}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#c4c2d4] hover:bg-[#1a1a26] disabled:opacity-40 transition-all"
            aria-label="New chat"
            title="New chat"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <Link href={`/app/companions/${companion.id}/memory`}>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#c4c2d4] hover:bg-[#1a1a26] transition-all"
              aria-label="Edit memory"
            >
              <Brain className="h-4 w-4" />
            </button>
          </Link>
          <Link href={`/app/companions/${companion.id}/edit`}>
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#c4c2d4] hover:bg-[#1a1a26] transition-all"
              aria-label="Companion settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-3xl shadow-lg animate-float">
              ✨
            </div>
            <p className="text-[#f1f0ff] font-medium">{companion.name}</p>
            <p className="text-sm text-[#6b7280] max-w-xs">
              Say something to start your conversation.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} companionName={companion.name} avatarUrl={companion.avatarUrl} />
        ))}

        {status === "sending" && <TypingIndicator avatarUrl={companion.avatarUrl} name={companion.name} />}
        {isGeneratingMedia && (
          <MediaGeneratingBubble
            companionName={companion.name}
            avatarUrl={companion.avatarUrl}
            mediaType={generatingMediaType}
          />
        )}
        {unaffordableHint && !isGeneratingMedia && (
          <MediaUnaffordableCard
            mediaType={unaffordableHint.mediaType}
            required={unaffordableHint.required}
            remaining={unaffordableHint.remaining}
            onDismiss={() => setUnaffordableHint(null)}
          />
        )}
        {mediaSuggestion && !isGeneratingMedia && !unaffordableHint && (
          <MediaSuggestionCard
            mediaType={mediaSuggestion.mediaType}
            scene={mediaSuggestion.scene}
            required={mediaSuggestion.creditsRequired}
            remaining={mediaSuggestion.creditsRemaining}
            submitting={submittingSuggestion}
            onSend={handleAcceptSuggestion}
            onEdit={() => {
              setImageSuggestionPrompt(mediaSuggestion.scene);
              setMediaModal(mediaSuggestion.mediaType);
              setMediaSuggestion(null);
            }}
            onDismiss={() => setMediaSuggestion(null)}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Alert banners ────────────────────────────────────────────────────── */}
      {alertState.type && (
        <div className="px-4 sm:px-6 pb-2 shrink-0">
          <div
            className={cn(
              "flex items-start justify-between gap-3 rounded-xl border px-4 py-3",
              alertState.type === "moderated" || alertState.type === "no_credits"
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-red-500/10 border-red-500/20"
            )}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={cn(
                  "h-4 w-4 shrink-0 mt-0.5",
                  alertState.type === "no_credits" || alertState.type === "moderated"
                    ? "text-amber-400"
                    : "text-red-400"
                )}
              />
              <p
                className={cn(
                  "text-sm",
                  alertState.type === "no_credits" || alertState.type === "moderated"
                    ? "text-amber-300"
                    : "text-red-400"
                )}
              >
                {alertState.message}
              </p>
            </div>
            <button
              onClick={clearAlert}
              className="text-[#6b7280] hover:text-[#c4c2d4] text-xs shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Low balance banner ───────────────────────────────────────────────── */}
      {credits > 0 && credits < 10 && alertState.type !== "no_credits" && (
        <div className="px-4 sm:px-6 pb-2 shrink-0">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-300">
                {credits} credit{credits !== 1 ? "s" : ""} remaining
              </span>
            </div>
            <Link href="/app/billing">
              <Button variant="secondary" size="sm" className="h-7 text-xs px-2.5">Top Up</Button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Media generation modal ───────────────────────────────────────────── */}
      {mediaModal && (
        <MediaRequestModal
          type={mediaModal}
          companionId={companion.id}
          companionName={companion.name}
          companionStyle={companion.visualStyle ?? companion.companionType}
          conversationId={currentConversationId}
          initialRequest={imageSuggestionPrompt ?? undefined}
          initialAspectRatio={
            mediaModal === "image"
              ? mediaSettings.defaultImageAspect
              : mediaSettings.defaultVideoAspect
          }
          initialDuration={String(mediaSettings.defaultVideoDuration) as "5" | "8" | "10"}
          initialStyle={mediaSettings.defaultImageStyle ?? undefined}
          initialMode={imageSuggestionMode ?? undefined}
          onClose={() => {
            setMediaModal(null);
            setImageSuggestionPrompt(null);
            setImageSuggestionMode(null);
          }}
          onSuccess={handleMediaSuccess}
        />
      )}

      {/* ── Input area ──────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-4 border-t border-[#2a2a3d] bg-[#0c0c14] shrink-0">
        {credits <= 0 ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-[#6b7280]">
              You&apos;re out of credits. Top up to keep chatting with {companion.name}.
            </p>
            <Link href="/app/billing">
              <Button size="sm">
                <Coins className="h-4 w-4" />
                Get More Credits
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Media generation buttons */}
            <div className="flex gap-2 mb-2">
              {/* Image: single tap = quick-generate from context; ⋯ = settings popover */}
              <div className="relative">
                {showMediaIntro && (
                  <div className="absolute -top-1 -left-1 -right-1 -bottom-1 rounded-xl ring-2 ring-amber-400/60 animate-pulse-glow pointer-events-none" />
                )}
                {showMediaIntro && (
                  <div className="absolute bottom-full mb-2 left-0 z-30 w-56 rounded-lg border border-amber-500/30 bg-amber-500/10 backdrop-blur-md px-3 py-2 text-[11px] text-amber-100 shadow-lg animate-fade-in">
                    <p className="leading-snug">
                      Tap <span className="font-semibold">Image</span> anytime, or just ask her —
                      she&apos;ll send pics on her own.
                    </p>
                    <button
                      type="button"
                      onClick={dismissMediaIntro}
                      className="absolute top-1 right-1 text-amber-300/70 hover:text-amber-200 p-0.5"
                      aria-label="Got it"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      dismissMediaIntro();
                      handleQuickImage();
                    }}
                    disabled={!isIdle || isGeneratingMedia}
                    title="Generate an image (uses conversation context)"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {isGeneratingMedia ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    {isGeneratingMedia ? "Generating…" : "Image"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsPopover((p) => (p === "image" ? null : "image"))
                    }
                    disabled={!isIdle || isGeneratingMedia}
                    title="Image defaults"
                    aria-label="Image defaults"
                    className={`flex items-center px-1.5 py-1.5 text-xs border-l border-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                      settingsPopover === "image"
                        ? "text-amber-300 bg-amber-500/10"
                        : "text-gray-500 hover:text-amber-300 hover:bg-amber-500/10"
                    }`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
                {settingsPopover === "image" && (
                  <MediaSettingsPopover
                    conversationId={currentConversationId}
                    type="image"
                    settings={mediaSettings}
                    onSettingsChange={setMediaSettings}
                    onClose={() => setSettingsPopover(null)}
                  />
                )}
              </div>

              {/* Video: single tap = open describe modal; ⋯ = settings popover */}
              <div className="relative">
                <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMediaModal("video")}
                    disabled={!isIdle}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <VideoIcon className="w-3.5 h-3.5" />
                    Video
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsPopover((p) => (p === "video" ? null : "video"))
                    }
                    disabled={!isIdle}
                    title="Video defaults"
                    aria-label="Video defaults"
                    className={`flex items-center px-1.5 py-1.5 text-xs border-l border-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                      settingsPopover === "video"
                        ? "text-rose-300 bg-rose-500/10"
                        : "text-gray-500 hover:text-rose-300 hover:bg-rose-500/10"
                    }`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
                {settingsPopover === "video" && (
                  <MediaSettingsPopover
                    conversationId={currentConversationId}
                    type="video"
                    settings={mediaSettings}
                    onSettingsChange={setMediaSettings}
                    onClose={() => setSettingsPopover(null)}
                  />
                )}
              </div>
            </div>

            {/* Pending attachment preview */}
            {attachment && (
              <AttachmentPreview attachment={attachment} onRemove={removeAttachment} />
            )}

            {/* Text input row */}
            <div className="flex gap-3 items-end">
              {/* Hidden file input — general attachments */}
              <input
                ref={fileInputRef}
                type="file"
                accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",")}
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Hidden file input — selfie (opens front camera on mobile) */}
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleSelfieSelect}
              />

              {/* Selfie / photo button */}
              <button
                type="button"
                onClick={() => selfieInputRef.current?.click()}
                disabled={isSending}
                className="h-[46px] w-[46px] shrink-0 flex items-center justify-center rounded-xl border border-[#2e2818] bg-[#12100a] text-[#6b7280] hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-500/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Share your photo or selfie"
                title="Share your photo"
              >
                <Camera className="h-4 w-4" />
              </button>

              {/* Attach file button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="h-[46px] w-[46px] shrink-0 flex items-center justify-center rounded-xl border border-[#2a2a3d] bg-[#12121a] text-[#6b7280] hover:text-[#c4c2d4] hover:border-[#3a3a50] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Attach image or video"
                title="Attach image or video"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isSending
                      ? `${companion.name} is responding...`
                      : `Message ${companion.name}...`
                  }
                  disabled={isSending}
                  rows={1}
                  className={cn(
                    "w-full resize-none rounded-xl border bg-[#12121a] px-4 py-3 text-sm text-[#f1f0ff]",
                    "placeholder:text-[#4b5563] transition-colors scrollbar-thin",
                    "focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "min-h-[46px] max-h-[120px]",
                    isSending ? "border-[#2a2a3d]" : "border-[#2a2a3d] hover:border-[#3a3a50]"
                  )}
                />
              </div>

              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="icon"
                className="h-[46px] w-[46px] shrink-0 rounded-xl"
                aria-label="Send message"
              >
                {isSending ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}

        <p className="text-[10px] text-[#2a2a3d] mt-2 text-center select-none">
          {creditCostPerMessage} credit per message &middot; {companion.name} is a fictional AI character
        </p>
      </div>
    </div>
  );
}
