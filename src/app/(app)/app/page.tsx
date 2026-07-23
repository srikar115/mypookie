import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import prisma from "@/lib/db";
import { getBalance } from "@/lib/billing/creditService";
import { Button } from "@/components/ui/button";
import {
  Users,
  MessageCircle,
  Coins,
  Sparkles,
  ArrowRight,
  Heart,
  Plus,
  Image as ImageIcon,
} from "lucide-react";
import { timeAgo, truncate } from "@/lib/utils";
import { DiscoverRow } from "./_components/DiscoverRow";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id as string;

  const [companionCount, credits, messageCount] = await Promise.all([
    prisma.companion.count({ where: { userId, status: "ACTIVE" } }),
    getBalance(userId),
    prisma.message.count({ where: { conversation: { userId }, role: "USER" } }),
  ]);

  // Recent companions with last conversation data
  const recentCompanions = await prisma.companion.findMany({
    where: { userId, status: "ACTIVE" },
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      companionType: true,
      avatarUrl: true,
      conversations: {
        take: 1,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          lastMessageAt: true,
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { content: true, role: true },
          },
        },
      },
    },
  });

  // Hero: most-recently-chatted companion
  const heroCompanion = recentCompanions.find((c) => c.conversations[0]?.lastMessageAt) ?? recentCompanions[0] ?? null;

  // Discover: up to 4 public companions the user hasn't cloned yet
  const discoverCompanions = await prisma.companion.findMany({
    where: { isPublic: true, status: "ACTIVE" },
    orderBy: { name: "asc" },
    take: 4,
    select: {
      id: true,
      name: true,
      companionType: true,
      genderPresentation: true,
      ageStyle: true,
      visualStyle: true,
      avatarUrl: true,
    },
  });

  const displayName = (session.user.name ?? "there").split(" ")[0];
  const mediaCount = await prisma.mediaGeneration.count({
    where: { userId, status: "COMPLETED" },
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Hero Banner ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden min-h-[300px] flex items-end border border-[#2e2818]">
        {/* Background: avatar or gradient */}
        {heroCompanion?.avatarUrl ? (
          <div className="absolute inset-0">
            <Image
              src={heroCompanion.avatarUrl}
              alt={heroCompanion.name}
              fill
              className="object-cover object-[center_30%]"
              unoptimized
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950 via-[#12100a] to-rose-950" />
        )}

        {/* Content */}
        <div className="relative z-10 p-6 w-full">
          <div className="max-w-lg">
            <p className="text-xs font-semibold text-amber-300 uppercase tracking-widest mb-1">
              Welcome back
            </p>
            <h1 className="text-3xl font-bold text-white mb-1">
              {displayName} 👋
            </h1>
            {heroCompanion ? (
              <p className="text-sm text-white/60 mb-4">
                {heroCompanion.name} is waiting for you
              </p>
            ) : (
              <p className="text-sm text-white/60 mb-4">
                Create your first AI companion to get started.
              </p>
            )}
            <div className="flex gap-2.5 flex-wrap">
              {heroCompanion ? (
                <Link href={`/app/chat/${heroCompanion.id}`}>
                  <Button className="shadow-lg">
                    <MessageCircle className="h-4 w-4" />
                    Continue Chatting
                  </Button>
                </Link>
              ) : null}
              <Link href="/app/companions/new">
                <Button variant={heroCompanion ? "outline" : "default"} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <Plus className="h-4 w-4" />
                  New Companion
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Companions",
            value: companionCount,
            icon: Users,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            href: "/app/companions",
          },
          {
            label: "Messages Sent",
            value: messageCount.toLocaleString(),
            icon: MessageCircle,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
            href: "/app/chat",
          },
          {
            label: "Credits",
            value: credits.toLocaleString(),
            icon: Coins,
            color: credits < 20 ? "text-red-400" : "text-amber-400",
            bg: credits < 20 ? "bg-red-500/10" : "bg-amber-500/10",
            border: credits < 20 ? "border-red-500/20" : "border-amber-500/20",
            href: "/app/billing",
          },
          {
            label: "Media Created",
            value: mediaCount.toLocaleString(),
            icon: ImageIcon,
            color: "text-rose-400",
            bg: "bg-rose-500/10",
            border: "border-rose-500/20",
            href: "/app/media",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <div className={`rounded-xl border ${stat.border} ${stat.bg} p-4 hover:opacity-80 transition-opacity`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0a0a0f]/30 shrink-0">
                    <Icon className={`h-4.5 w-4.5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[#f1f0ff] leading-tight">{stat.value}</p>
                    <p className="text-xs text-[#6b7280]">{stat.label}</p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Low credit warning */}
      {credits < 10 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Coins className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">Running low — {credits} credits remaining.</p>
          </div>
          <Link href="/app/billing">
            <Button variant="secondary" size="sm">Top Up</Button>
          </Link>
        </div>
      )}

      {/* ── Your Companions ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#f1f0ff]">Your Companions</h2>
          {recentCompanions.length > 0 && (
            <Link href="/app/companions?tab=mine">
              <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {/* Create card — always first */}
          <Link href="/app/companions/new">
            <div className="group rounded-2xl border border-dashed border-amber-500/30 bg-amber-950/10 aspect-[9/16] flex flex-col items-center justify-center gap-3 p-4 hover:border-amber-400/50 hover:bg-amber-950/20 transition-all duration-200 cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
                <Plus className="h-6 w-6 text-amber-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-amber-300 text-sm">Create Companion</p>
                <p className="text-xs text-[#6b7280] mt-0.5">Design your perfect AI</p>
              </div>
            </div>
          </Link>

          {recentCompanions.length === 0 && (
            <div className="col-span-2 sm:col-span-2 rounded-xl border border-dashed border-[#2e2818] bg-[#12100a]/30 p-10 flex flex-col items-center justify-center text-center">
              <Sparkles className="h-8 w-8 text-amber-400/40 mb-3" />
              <p className="text-sm text-[#6b7280]">No companions yet — create one or browse below.</p>
            </div>
          )}

          {recentCompanions.map((companion) => {
            const conv = companion.conversations[0];
            const lastMsg = conv?.messages[0];
            const rawContent = lastMsg?.content;
            const lastText =
              typeof rawContent === "string" ? rawContent : rawContent ? JSON.stringify(rawContent) : null;
            const preview = lastText ? truncate(lastText, 60) : null;

            return (
              <div
                key={companion.id}
                className="group rounded-2xl border border-[#2e2818] bg-[#12100a] overflow-hidden hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-200"
              >
                <div className="relative aspect-[9/16] bg-gradient-to-br from-amber-950/40 to-rose-950/30 overflow-hidden">
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
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-3xl shadow-lg">
                        ✨
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
                    <p className="font-bold text-white text-sm leading-tight">{companion.name}</p>
                    {companion.companionType && (
                      <p className="text-xs text-white/55">{companion.companionType}</p>
                    )}
                  </div>
                </div>

                <div className="px-3 pt-2.5 pb-3 space-y-2">
                  {preview ? (
                    <p className="text-xs text-[#9ca3af] line-clamp-2 leading-snug">{preview}</p>
                  ) : (
                    <p className="text-xs text-[#4b5563] italic">No messages yet</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    {conv?.lastMessageAt && (
                      <span className="text-[10px] text-[#4b5563]">{timeAgo(conv.lastMessageAt)}</span>
                    )}
                    <div className="flex gap-1.5 ml-auto">
                      <Link href={`/app/chat/${companion.id}`}>
                        <Button size="sm">
                          <MessageCircle className="h-3.5 w-3.5" />
                          Chat
                        </Button>
                      </Link>
                      <Link href={`/app/companions/${companion.id}`}>
                        <Button variant="outline" size="icon-sm" aria-label="View">
                          <Heart className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Discover ────────────────────────────────────────────────────── */}
      {discoverCompanions.length > 0 && (
        <DiscoverRow companions={discoverCompanions} />
      )}
    </div>
  );
}
