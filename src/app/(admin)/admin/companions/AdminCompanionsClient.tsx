"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Plus,
  RefreshCw,
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  ImagePlus,
  Loader2,
  Users,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Companion {
  id: string;
  name: string;
  companionType: string | null;
  genderPresentation: string | null;
  ageStyle: string | null;
  visualStyle: string | null;
  overallVibe: string | null;
  personalityPreset: string | null;
  avatarUrl: string | null;
  status: string;
  isPublic: boolean;
  createdAt: Date;
}

interface Props {
  initialCompanions: Companion[];
}

export function AdminCompanionsClient({ initialCompanions }: Props) {
  const [companions, setCompanions] = useState<Companion[]>(initialCompanions);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/companions?public=true");
    if (res.ok) {
      const data = await res.json();
      setCompanions(data.companions);
    }
  }, []);

  async function generateAvatar(id: string) {
    setGeneratingIds((prev) => new Set(prev).add(id));
    setCompanions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, avatarUrl: null } : c))
    );

    await fetch(`/api/admin/companions/${id}/avatar`, { method: "POST" });

    // Poll until avatar appears
    const poll = async () => {
      const res = await fetch(`/api/admin/companions/${id}/avatar`);
      if (res.ok) {
        const data = await res.json();
        if (data.avatarUrl) {
          setCompanions((prev) =>
            prev.map((c) => (c.id === id ? { ...c, avatarUrl: data.avatarUrl } : c))
          );
          setGeneratingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }
      }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
  }

  async function generateAllAvatars() {
    setGeneratingAll(true);
    const res = await fetch("/api/admin/companions/generate-all-avatars", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      // Mark all queued companions as generating
      const queued = companions.filter((c) => !c.avatarUrl);
      queued.forEach((c) => setGeneratingIds((prev) => new Set(prev).add(c.id)));
      // Start polling all of them
      queued.forEach((c) => {
        const poll = async () => {
          const r = await fetch(`/api/admin/companions/${c.id}/avatar`);
          if (r.ok) {
            const d = await r.json();
            if (d.avatarUrl) {
              setCompanions((prev) =>
                prev.map((x) => (x.id === c.id ? { ...x, avatarUrl: d.avatarUrl } : x))
              );
              setGeneratingIds((prev) => {
                const next = new Set(prev);
                next.delete(c.id);
                return next;
              });
              return;
            }
          }
          setTimeout(poll, 4000);
        };
        setTimeout(poll, 5000);
      });
      alert(`Queued ${data.queued} avatar generation(s).`);
    }
    setGeneratingAll(false);
  }

  async function togglePublic(id: string) {
    setTogglingIds((prev) => new Set(prev).add(id));
    const res = await fetch(`/api/admin/companions/${id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "isPublic" }),
    });
    if (res.ok) {
      const data = await res.json();
      setCompanions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isPublic: data.isPublic } : c))
      );
    }
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function deleteCompanion(id: string, name: string) {
    if (!confirm(`Archive and hide "${name}"? This will remove it from the public browse tab.`)) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    const res = await fetch(`/api/admin/companions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCompanions((prev) => prev.filter((c) => c.id !== id));
    }
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const noAvatarCount = companions.filter((c) => !c.avatarUrl).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f0ff] flex items-center gap-2">
            <Users className="h-6 w-6 text-purple-400" />
            Public Companions
          </h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {companions.length} template companions · {noAvatarCount} missing avatars
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {noAvatarCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateAllAvatars}
              disabled={generatingAll}
            >
              {generatingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              Generate All Missing Avatars ({noAvatarCount})
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Link href="/admin/companions/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Companion
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid */}
      {companions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-10 w-10 text-purple-400/40 mx-auto mb-3" />
            <p className="text-sm text-[#6b7280]">No public companions yet.</p>
            <Link href="/admin/companions/new" className="mt-4 inline-block">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Create First Companion
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {companions.map((c) => {
            const isGenerating = generatingIds.has(c.id);
            const isToggling = togglingIds.has(c.id);
            const isDeleting = deletingIds.has(c.id);

            return (
              <Card key={c.id} className="overflow-hidden p-0 gap-0">
                {/* Avatar */}
                <div className="relative h-48 bg-gradient-to-br from-purple-950/40 to-pink-950/30 flex items-center justify-center overflow-hidden">
                  {c.avatarUrl ? (
                    <Image
                      src={c.avatarUrl}
                      alt={c.name}
                      fill
                      className="object-cover object-top"
                      unoptimized
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[#4b5563]">
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                          <p className="text-xs">Generating…</p>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-8 w-8 text-purple-400/30" />
                          <p className="text-xs">No avatar</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Overlay badges */}
                  <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                    <Badge
                      variant={c.status === "ACTIVE" ? "success" : "secondary"}
                      className="text-[10px]"
                    >
                      {c.status.toLowerCase()}
                    </Badge>
                    {c.isPublic && (
                      <Badge variant="warning" className="text-[10px]">Public</Badge>
                    )}
                  </div>

                  {/* Avatar done indicator */}
                  {c.avatarUrl && (
                    <div className="absolute bottom-2 right-2">
                      <CheckCircle className="h-4 w-4 text-green-400 drop-shadow" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <CardContent className="p-3 space-y-1.5">
                  <div>
                    <p className="font-semibold text-[#f1f0ff] text-sm">{c.name}</p>
                    <p className="text-xs text-[#6b7280]">
                      {c.companionType} · {c.genderPresentation} · {c.ageStyle}
                    </p>
                    {c.visualStyle && (
                      <p className="text-xs text-purple-400/80">{c.visualStyle}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    <Link href={`/admin/companions/${c.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs">
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                    </Link>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Regenerate avatar"
                      onClick={() => generateAvatar(c.id)}
                      disabled={isGenerating}
                      title="Regenerate avatar"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={c.isPublic ? "Hide from browse" : "Make public"}
                      onClick={() => togglePublic(c.id)}
                      disabled={isToggling}
                      title={c.isPublic ? "Hide from browse" : "Make public"}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : c.isPublic ? (
                        <Eye className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-[#6b7280]" />
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Delete"
                      onClick={() => deleteCompanion(c.id, c.name)}
                      disabled={isDeleting}
                      title="Archive & hide"
                      className="text-red-400 hover:text-red-300 hover:border-red-500/30"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
