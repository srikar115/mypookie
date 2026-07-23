"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublicCompanion {
  id: string;
  name: string;
  companionType: string | null;
  genderPresentation: string | null;
  ageStyle: string | null;
  visualStyle: string | null;
  avatarUrl: string | null;
}

export function DiscoverRow({ companions }: { companions: PublicCompanion[] }) {
  const router = useRouter();
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleChat(companionId: string) {
    if (cloningId) return;
    setCloningId(companionId);
    try {
      const res = await fetch(`/api/companions/${companionId}/clone`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      startTransition(() => router.push(`/app/chat/${data.companionId}`));
    } catch {
      setCloningId(null);
    }
  }

  if (companions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#fff8ee]">Discover Companions</h2>
        <a href="/app/companions" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
          See all →
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {companions.map((c) => (
          <div
            key={c.id}
            className="group relative rounded-2xl border border-[#2e2818] bg-[#12100a] overflow-hidden hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200"
          >
            {/* Portrait — 9:16 */}
            <div className="relative aspect-[9/16] bg-gradient-to-br from-amber-950/40 to-rose-950/30 overflow-hidden">
              {c.avatarUrl ? (
                <Image
                  src={c.avatarUrl}
                  alt={c.name}
                  fill
                  className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-4xl">✨</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
                <p className="font-bold text-white text-sm">{c.name}</p>
                {c.companionType && (
                  <p className="text-xs text-white/55">{c.companionType}</p>
                )}
              </div>

              {/* Style badge */}
              {c.visualStyle && (
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-white/70">
                    {c.visualStyle}
                  </span>
                </div>
              )}
            </div>

            <div className="px-2.5 py-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleChat(c.id)}
                disabled={cloningId === c.id}
              >
                {cloningId === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                {cloningId === c.id ? "Starting…" : "Chat"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
