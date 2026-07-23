"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  ImageIcon,
  VideoIcon,
  Loader2,
  Trash2,
  RefreshCw,
  Eye,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  ChevronDown,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface MediaItem {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: "QUEUED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  storageUrl: string | null;
  thumbnailUrl: string | null;
  userRequest: string | null;
  prompt: string;
  aspectRatio: string | null;
  style: string | null;
  durationSeconds: number | null;
  modelSlug: string | null;
  creditsUsed: number;
  creditsReserved: number;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  companion: { id: string; name: string } | null;
}

interface MediaResponse {
  items: MediaItem[];
  total: number;
  pages: number;
}

const STATUS_CONFIG = {
  QUEUED: { label: "Queued", icon: Clock, color: "text-gray-400", bg: "bg-gray-500/15 border-gray-500/25" },
  PENDING: { label: "Pending", icon: Clock, color: "text-gray-400", bg: "bg-gray-500/15 border-gray-500/25" },
  PROCESSING: { label: "Processing", icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/25" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/15 border-green-500/25" },
  FAILED: { label: "Failed", icon: XCircle, color: "text-red-400", bg: "bg-red-500/15 border-red-500/25" },
};

function StatusBadge({ status }: { status: MediaItem["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium", cfg.bg, cfg.color)}>
      <Icon className={cn("w-3 h-3", status === "PROCESSING" && "animate-spin")} />
      {cfg.label}
    </span>
  );
}

function MediaPreviewModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-[#0d0d1a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Close */}
        <button onClick={onClose} className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* Media */}
        <div className="bg-black flex items-center justify-center min-h-[200px] max-h-[60vh] overflow-hidden">
          {item.status === "COMPLETED" && item.storageUrl ? (
            item.type === "IMAGE" ? (
              <Image src={item.storageUrl} alt={item.userRequest ?? "Generated image"} width={600} height={600} className="max-h-[60vh] object-contain" unoptimized />
            ) : (
              <video src={item.storageUrl} controls className="max-h-[60vh] w-full" playsInline />
            )
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              {item.type === "IMAGE" ? <ImageIcon className="w-12 h-12 text-gray-600" /> : <VideoIcon className="w-12 h-12 text-gray-600" />}
              <StatusBadge status={item.status} />
              {item.status === "FAILED" && item.errorMessage && (
                <p className="text-sm text-red-400 max-w-xs">{item.errorMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {item.type === "IMAGE" ? <ImageIcon className="w-4 h-4 text-purple-400" /> : <VideoIcon className="w-4 h-4 text-pink-400" />}
              <span className="font-medium text-white text-sm">{item.type === "IMAGE" ? "Image" : "Video"}</span>
              {item.companion && <span className="text-xs text-gray-500">· {item.companion.name}</span>}
            </div>
            <StatusBadge status={item.status} />
          </div>

          {item.userRequest && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Your request</p>
              <p className="text-sm text-gray-300">{item.userRequest}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/5 rounded-lg px-3 py-2">
              <p className="text-gray-500 mb-0.5">Credits used</p>
              <p className="text-white font-medium">{item.creditsUsed || item.creditsReserved}</p>
            </div>
            <div className="bg-white/5 rounded-lg px-3 py-2">
              <p className="text-gray-500 mb-0.5">Created</p>
              <p className="text-white font-medium">{formatDate(item.createdAt)}</p>
            </div>
            {item.aspectRatio && (
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-gray-500 mb-0.5">Aspect ratio</p>
                <p className="text-white font-medium capitalize">{item.aspectRatio}</p>
              </div>
            )}
            {item.style && (
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-gray-500 mb-0.5">Style</p>
                <p className="text-white font-medium">{item.style}</p>
              </div>
            )}
            {item.durationSeconds && (
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-gray-500 mb-0.5">Duration</p>
                <p className="text-white font-medium">{item.durationSeconds}s</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MediaGalleryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [companionFilter, setCompanionFilter] = useState<string>("all");
  const [companions, setCompanions] = useState<Array<{ id: string; name: string }>>([]);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filter !== "all") params.set("type", filter);
      if (companionFilter !== "all") params.set("companionId", companionFilter);
      const res = await fetch(`/api/media?${params}`);
      if (res.ok) {
        const data = (await res.json()) as MediaResponse;
        setItems(data.items);
        setTotal(data.total);
        setPages(data.pages);

        // Collect unique companions
        const seen = new Map<string, string>();
        data.items.forEach((i) => { if (i.companion) seen.set(i.companion.id, i.companion.name); });
        setCompanions(Array.from(seen, ([id, name]) => ({ id, name })));
      }
    } finally {
      setLoading(false);
    }
  }, [page, filter, companionFilter]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  // Poll processing items
  useEffect(() => {
    const processingIds = items.filter((i) => i.status === "PROCESSING" || i.status === "QUEUED").map((i) => i.id);
    if (processingIds.length === 0) return;

    const interval = setInterval(async () => {
      setPolling(true);
      for (const id of processingIds) {
        try {
          const res = await fetch(`/api/media/jobs/${id}`);
          if (res.ok) {
            const updated = (await res.json()) as { status: string; resultUrl?: string };
            setItems((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, status: updated.status.toUpperCase() as MediaItem["status"], storageUrl: updated.resultUrl ?? item.storageUrl }
                  : item
              )
            );
          }
        } catch { /* ignore */ }
      }
      setPolling(false);
    }, 8000);

    return () => clearInterval(interval);
  }, [items]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this media item?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setTotal((t) => t - 1);
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Media Gallery</h1>
          <p className="text-sm text-gray-400 mt-1">
            {total} item{total !== 1 ? "s" : ""} generated
          </p>
        </div>
        {polling && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Refreshing…
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["all", "image", "video"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all",
              filter === f
                ? "border-purple-500 bg-purple-500/20 text-purple-300"
                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
            )}
          >
            {f === "image" && <ImageIcon className="w-3.5 h-3.5" />}
            {f === "video" && <VideoIcon className="w-3.5 h-3.5" />}
            {f === "all" && <Sparkles className="w-3.5 h-3.5" />}
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        {companions.length > 0 && (
          <div className="relative">
            <select
              value={companionFilter}
              onChange={(e) => { setCompanionFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-400 focus:outline-none focus:border-purple-500/50"
            >
              <option value="all">All Companions</option>
              {companions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-medium">No media yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Request images or videos from the chat page to see them here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative bg-[#0d0d1a] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all"
            >
              {/* Thumbnail */}
              <div className="aspect-square bg-black relative overflow-hidden">
                {item.status === "COMPLETED" && item.storageUrl ? (
                  item.type === "IMAGE" ? (
                    <Image
                      src={item.storageUrl}
                      alt={item.userRequest ?? ""}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-900/40 to-purple-900/40">
                      <VideoIcon className="w-8 h-8 text-pink-400" />
                    </div>
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    {item.type === "IMAGE" ? (
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    ) : (
                      <VideoIcon className="w-8 h-8 text-gray-600" />
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPreviewItem(item)}
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    className="w-9 h-9 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors"
                    title="Delete"
                  >
                    {deleting === item.id ? (
                      <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-400" />
                    )}
                  </button>
                </div>

                {/* Type badge */}
                <div className="absolute top-2 left-2">
                  {item.type === "IMAGE" ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-purple-300 text-xs">
                      <ImageIcon className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-pink-300 text-xs">
                      <VideoIcon className="w-3 h-3" />
                    </span>
                  )}
                </div>

                {/* Failed indicator */}
                {item.status === "FAILED" && (
                  <div className="absolute top-2 right-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div className="px-3 py-2.5">
                <p className="text-xs text-gray-400 truncate">
                  {item.userRequest ?? item.prompt.substring(0, 50)}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-gray-600">{formatDate(item.createdAt)}</span>
                  <span className="text-xs text-gray-600">{item.creditsUsed || item.creditsReserved} cr</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-400 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-4 py-2 rounded-lg border border-white/10 text-sm text-gray-400 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewItem && (
        <MediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}
