"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  MessageCircle,
  Settings,
  Heart,
  Plus,
  Sparkles,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicCompanion {
  id: string;
  name: string;
  companionType: string | null;
  genderPresentation: string | null;
  ageStyle: string | null;
  visualStyle: string | null;
  overallVibe: string | null;
  avatarUrl: string | null;
  customAppearanceNotes: string | null;
  status: string;
  createdAt: Date;
}

interface UserCompanion {
  id: string;
  name: string;
  companionType: string | null;
  genderPresentation: string | null;
  ageStyle: string | null;
  visualStyle: string | null;
  overallVibe: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
}

interface Props {
  publicCompanions: PublicCompanion[];
  userCompanions: UserCompanion[];
  defaultTab?: "browse" | "mine";
}

// ─── Visual style badge color ─────────────────────────────────────────────────

function styleBadgeClass(style: string | null) {
  if (!style) return "bg-[#1a1610] text-[#6b7280]";
  const s = style.toLowerCase();
  if (s.includes("realistic")) return "bg-amber-950/60 text-amber-300";
  if (s.includes("anime")) return "bg-rose-950/60 text-rose-300";
  if (s.includes("3d")) return "bg-blue-950/60 text-blue-300";
  if (s.includes("cinematic")) return "bg-orange-950/60 text-orange-300";
  return "bg-[#1a1610] text-[#6b7280]";
}

// ─── CompanionCard ────────────────────────────────────────────────────────────

function CompanionCard({
  companion,
  isPublic = false,
  onChat,
  cloning = false,
}: {
  companion: PublicCompanion | UserCompanion;
  isPublic?: boolean;
  onChat?: () => void;
  cloning?: boolean;
}) {
  return (
    <div className="group relative rounded-2xl border border-[#2e2818] bg-[#12100a] overflow-hidden hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200">
      {/* Portrait image area — 9:16 */}
      <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-br from-amber-950/40 to-rose-950/30">
        {companion.avatarUrl ? (
          <Image
            src={companion.avatarUrl}
            alt={companion.name}
            fill
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-4xl shadow-xl">
              ✨
            </div>
          </div>
        )}

        {/* Bottom gradient overlay with name + type */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="font-bold text-white text-base leading-tight">
            {companion.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {companion.companionType && (
              <span className="text-xs text-white/70">{companion.companionType}</span>
            )}
          </div>
        </div>

        {/* Visual style badge — top right */}
        {companion.visualStyle && (
          <div className="absolute top-2.5 right-2.5">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-sm ${styleBadgeClass(companion.visualStyle)}`}
            >
              {companion.visualStyle}
            </span>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="px-3 py-2.5 flex gap-2">
        {isPublic ? (
          <Button
            size="sm"
            className="flex-1"
            onClick={onChat}
            disabled={cloning}
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" />
            )}
            {cloning ? "Starting…" : "Chat"}
          </Button>
        ) : (
          <>
            <Link href={`/app/chat/${companion.id}`} className="flex-1">
              <Button size="sm" className="w-full">
                <MessageCircle className="h-3.5 w-3.5" />
                Chat
              </Button>
            </Link>
            <Link href={`/app/companions/${companion.id}`}>
              <Button variant="outline" size="icon-sm" aria-label="View companion">
                <Heart className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href={`/app/companions/${companion.id}/edit`}>
              <Button variant="outline" size="icon-sm" aria-label="Edit companion">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Create CTA card ──────────────────────────────────────────────────────────

function CreateCompanionCard() {
  return (
    <Link href="/app/companions/new">
      <div className="group rounded-2xl border border-dashed border-amber-500/30 bg-amber-950/10 aspect-[9/16] flex flex-col items-center justify-center gap-3 p-4 hover:border-amber-400/60 hover:bg-amber-950/20 transition-all duration-200 cursor-pointer">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
          <Plus className="h-7 w-7 text-amber-400" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-amber-300 text-sm">Create Your Companion</p>
          <p className="text-xs text-[#6b7280] mt-1">Design your perfect AI</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

const STYLE_FILTERS = ["All", "Realistic", "Anime", "3D", "Cinematic", "Digital Art"] as const;
type StyleFilter = typeof STYLE_FILTERS[number];

function matchesStyle(visualStyle: string | null, filter: StyleFilter): boolean {
  if (filter === "All") return true;
  if (!visualStyle) return false;
  const s = visualStyle.toLowerCase();
  if (filter === "Realistic") return s.includes("realistic");
  if (filter === "Anime") return s.includes("anime");
  if (filter === "3D") return s.includes("3d");
  if (filter === "Cinematic") return s.includes("cinematic");
  if (filter === "Digital Art") return s.includes("digital");
  return false;
}

export function CompanionsPageClient({ publicCompanions, userCompanions, defaultTab = "browse" }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"browse" | "mine">(defaultTab);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("All");

  async function handleChatPublic(companionId: string) {
    if (cloningId) return;
    setCloningId(companionId);
    try {
      const res = await fetch(`/api/companions/${companionId}/clone`, { method: "POST" });
      if (!res.ok) throw new Error("Clone failed");
      const data = await res.json();
      startTransition(() => {
        router.push(`/app/chat/${data.companionId}`);
      });
    } catch {
      setCloningId(null);
    }
  }

  const filteredPublic = useMemo(() => {
    const q = search.toLowerCase();
    return publicCompanions.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.companionType ?? "").toLowerCase().includes(q) ||
        (c.overallVibe ?? "").toLowerCase().includes(q);
      return matchesSearch && matchesStyle(c.visualStyle, styleFilter);
    });
  }, [publicCompanions, search, styleFilter]);

  const filteredMine = useMemo(() => {
    const q = search.toLowerCase();
    return userCompanions.filter((c) => {
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.companionType ?? "").toLowerCase().includes(q)
      );
    });
  }, [userCompanions, search]);

  const tabs = [
    { id: "browse" as const, label: "Companions", count: publicCompanions.length },
    { id: "mine" as const, label: "Your Companions", count: userCompanions.length },
  ];

  const clearSearch = () => {
    setSearch("");
    setStyleFilter("All");
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f0ff]">Companions</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {activeTab === "browse"
              ? `${filteredPublic.length} of ${publicCompanions.length} companions`
              : `${filteredMine.length} of ${userCompanions.length} companions`}
          </p>
        </div>
        {activeTab === "mine" && (
          <Link href="/app/companions/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Companion
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs + Search row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Tabs */}
        <div className="flex gap-1 bg-[#12100a] border border-[#2e2818] rounded-xl p-1 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-[#6b7280] hover:text-amber-300 hover:bg-amber-950/20"
              }`}
            >
              {tab.label}
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-[#2e2818] text-[#6b7280]"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6b7280]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companions…"
            className="pl-8 pr-8 h-9 text-sm bg-[#12121a] border-[#2a2a3d]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#c4c2d4]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Style filter pills — only on browse tab */}
      {activeTab === "browse" && (
        <div className="flex gap-2 flex-wrap">
          {STYLE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStyleFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 ${
                styleFilter === f
                  ? "bg-amber-500 border-amber-400 text-white"
                  : "border-[#2e2818] text-[#6b7280] hover:border-amber-500/40 hover:text-amber-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Browse tab */}
      {activeTab === "browse" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <CreateCompanionCard />
          {filteredPublic.length === 0 ? (
            <div className="col-span-2 sm:col-span-2 rounded-xl border border-dashed border-[#2e2818] p-10 text-center">
              <p className="text-sm text-[#6b7280]">No companions match your search.</p>
              <button onClick={clearSearch} className="mt-2 text-xs text-amber-400 hover:text-amber-300">
                Clear filters
              </button>
            </div>
          ) : (
            filteredPublic.map((companion) => (
              <CompanionCard
                key={companion.id}
                companion={companion}
                isPublic
                cloning={cloningId === companion.id}
                onChat={() => handleChatPublic(companion.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Your companions tab */}
      {activeTab === "mine" && (
        <>
          {userCompanions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2e2818] bg-[#12100a]/50 p-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-[#fff8ee] mb-2">No companions yet</h3>
              <p className="text-sm text-[#6b7280] mb-6 max-w-sm mx-auto">
                Browse the Companions tab to chat with a pre-made companion, or create your own.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button variant="outline" onClick={() => setActiveTab("browse")}>
                  Browse Companions
                </Button>
                <Link href="/app/companions/new">
                  <Button>
                    <Sparkles className="h-4 w-4" />
                    Create Your Own
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              <CreateCompanionCard />
              {filteredMine.length === 0 ? (
                <div className="col-span-2 sm:col-span-2 rounded-xl border border-dashed border-[#2e2818] p-10 text-center">
                  <p className="text-sm text-[#6b7280]">No companions match your search.</p>
                  <button onClick={() => setSearch("")} className="mt-2 text-xs text-amber-400 hover:text-amber-300">
                    Clear search
                  </button>
                </div>
              ) : (
                filteredMine.map((companion) => (
                  <CompanionCard key={companion.id} companion={companion} />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
