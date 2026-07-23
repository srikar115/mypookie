"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  MessageCircle,
  Image as ImageIcon,
  CreditCard,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RecentChat {
  companionId: string;
  companionName: string;
  avatarUrl: string | null;
  lastMessageAt: Date | null;
}

interface SidebarProps {
  recentChats?: RecentChat[];
}

const navItems = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/companions", label: "Companions", icon: Users },
  { href: "/app/chat", label: "Chat", icon: MessageCircle },
  { href: "/app/media", label: "Media", icon: ImageIcon },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ recentChats = [] }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapse state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: next }));
      return next;
    });
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const isChatActive = isActive("/app/chat");

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-[#0c0c14] border-r border-[#2a2a3d] flex flex-col z-30 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-16 border-b border-[#2e2818] shrink-0", collapsed ? "justify-center px-0" : "gap-2.5 px-5")}>
        <Image src="/honey-bunny-logo.png" alt="Honey Bunny" width={32} height={32} className="rounded-lg shrink-0" />
        {!collapsed && (
          <span className="text-base font-bold text-gradient truncate">Honey Bunny</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-thin min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          const showDot = item.href === "/app/chat" && !isChatActive && recentChats.length > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative",
                collapsed ? "justify-center" : "",
                active
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  : "text-[#6b7280] hover:text-[#e5d5b8] hover:bg-[#1a1610]"
              )}
            >
              <div className="relative shrink-0">
                <Icon className={cn("h-4 w-4", active ? "text-amber-400" : "text-[#6b7280] group-hover:text-[#9ca3af]")} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-[#0c0c14]" />
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight className="h-3.5 w-3.5 text-amber-400/60" />}
                </>
              )}
            </Link>
          );
        })}

        {/* Recent chats section */}
        {!collapsed && recentChats.length > 0 && (
          <div className="pt-3 mt-1">
            <div className="flex items-center gap-1.5 px-3 mb-1.5">
              <Clock className="h-3 w-3 text-[#4b5563]" />
              <p className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-wider">Recent</p>
            </div>
            {recentChats.slice(0, 3).map((chat) => (
              <Link
                key={chat.companionId}
                href={`/app/chat/${chat.companionId}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-[#6b7280] hover:text-[#c4c2d4] hover:bg-[#1a1a26] group"
              >
                {/* Mini avatar */}
                <div className="relative h-6 w-6 rounded-full overflow-hidden bg-gradient-to-br from-amber-400 to-rose-400 shrink-0">
                  {chat.avatarUrl && (
                    <Image src={chat.avatarUrl} alt={chat.companionName} fill className="object-cover object-top" unoptimized />
                  )}
                </div>
                <span className="truncate text-xs">{chat.companionName}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className={cn("px-2 pb-4 space-y-2 shrink-0", collapsed && "px-2")}>
        {!collapsed && (
          <Link
            href="/app/companions/new"
            className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-sm font-medium bg-gradient-primary text-white hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-4 w-4" />
            New Companion
          </Link>
        )}
        {collapsed && (
          <Link
            href="/app/companions/new"
            title="New Companion"
            className="flex items-center justify-center w-full rounded-lg py-2.5 bg-gradient-primary text-white hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="flex items-center justify-center w-full py-2 rounded-lg text-[#4b5563] hover:text-[#c4c2d4] hover:bg-[#1a1a26] transition-colors text-xs gap-1.5"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
