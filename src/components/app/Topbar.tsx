"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Coins,
  ChevronDown,
  User,
  Settings,
  LogOut,
  CreditCard,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
  credits: number;
}

export function Topbar({ user, credits }: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    setSidebarCollapsed(stored === "true");

    const onToggle = (e: CustomEvent<boolean>) => setSidebarCollapsed(e.detail);
    window.addEventListener("sidebar-toggle", onToggle as EventListener);
    return () => window.removeEventListener("sidebar-toggle", onToggle as EventListener);
  }, []);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  const displayName = user.name ?? user.email?.split("@")[0] ?? "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-[#2a2a3d] flex items-center justify-end px-6 z-20 gap-4 transition-all duration-200"
      style={{ left: sidebarCollapsed ? 64 : 240 }}
    >
      {/* Credit Balance Pill */}
      <Link
        href="/app/billing"
        className="flex items-center gap-2 rounded-full border border-[#2a2a3d] bg-[#12121a] hover:bg-[#1a1a26] transition-colors px-3.5 py-1.5 group"
      >
        <Coins className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-sm font-semibold text-[#f1f0ff]">
          {credits.toLocaleString()}
        </span>
        <span className="text-xs text-[#6b7280]">credits</span>
      </Link>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2.5 rounded-full border border-[#2a2a3d] bg-[#12121a] hover:bg-[#1a1a26] transition-colors pl-1.5 pr-3 py-1.5"
          aria-expanded={menuOpen}
          aria-haspopup="true"
        >
          {/* Avatar */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-white text-xs font-semibold">
            {initials}
          </div>
          <span className="text-sm font-medium text-[#c4c2d4] hidden sm:block max-w-24 truncate">
            {displayName}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[#6b7280] transition-transform",
              menuOpen && "rotate-180"
            )}
          />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-[#2a2a3d] bg-[#12121a] shadow-xl z-20 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2a2a3d]">
                <p className="text-sm font-medium text-[#f1f0ff] truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[#6b7280] truncate">{user.email}</p>
              </div>

              <nav className="py-1">
                {[
                  { href: "/app/settings", icon: User, label: "Profile" },
                  { href: "/app/billing", icon: CreditCard, label: "Billing" },
                  { href: "/app/settings", icon: Settings, label: "Settings" },
                  ...(user.role === "ADMIN"
                    ? [{ href: "/admin", icon: Shield, label: "Admin Panel" }]
                    : []),
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#c4c2d4] hover:text-[#f1f0ff] hover:bg-[#1a1a26] transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4 text-[#6b7280]" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-[#2a2a3d] py-1">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
