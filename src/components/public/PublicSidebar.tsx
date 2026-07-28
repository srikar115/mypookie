"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Compass,
  MessageCircle,
  Layers,
  Sparkles,
  User,
  Lock,
  Crown,
  Globe,
  MessageSquareText,
  LifeBuoy,
  Mail,
  Users,
} from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { SessionUser } from "@/modules/identity/client";

/**
 * Nav items are "protected" when they require an authenticated user.
 * `/` (Home) is always public — everything else is behind auth.
 * `PublicSidebar` renders protected items as real <Link> nodes when the
 * user is signed in, or as buttons that open the auth dialog when they
 * aren't. The gate ONLY fires for anonymous users.
 */
const primaryNav = [
  { label: "Home",             href: "/",           icon: Home,           requiresAuth: false },
  { label: "Discover",         href: "/discover",   icon: Compass,        requiresAuth: true },
  { label: "Chat",             href: "/chat",       icon: MessageCircle,  requiresAuth: true },
  { label: "Collection",       href: "/collection", icon: Layers,         requiresAuth: true },
  { label: "Create Character", href: "/create",     icon: Sparkles,       requiresAuth: true },
  { label: "My AI",            href: "/my-ai",      icon: User,           requiresAuth: true },
  { label: "Private Content",  href: "/private",    icon: Lock,           requiresAuth: true },
] as const;

const secondaryNav = [
  { label: "English", href: "#", icon: Globe },
  { label: "Discord", href: "#", icon: MessageSquareText },
  { label: "Help Center", href: "#", icon: LifeBuoy },
  { label: "Contact Us", href: "/contact", icon: Mail },
  { label: "Affiliate", href: "/affiliate", icon: Users },
];

interface PublicSidebarProps {
  user: SessionUser | null;
  onProtectedClick: () => void;
}

export function PublicSidebar({ user, onProtectedClick }: PublicSidebarProps) {
  const pathname = usePathname();
  const isAuthenticated = user !== null;

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-56 border-r border-[#1e1e26] bg-[#0a0a0f] hidden md:flex flex-col z-40">
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3">
        <ul className="space-y-1">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            // Protected items become real links once the user is signed in.
            const shouldGate = item.requiresAuth && !isAuthenticated;

            const content = (
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                  isActive
                    ? "bg-[#1a1a22] text-white"
                    : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium">{item.label}</span>
              </div>
            );

            return (
              <li key={item.label}>
                {shouldGate ? (
                  <button
                    onClick={onProtectedClick}
                    className="w-full text-left cursor-pointer"
                  >
                    {content}
                  </button>
                ) : (
                  <Link href={item.href}>{content}</Link>
                )}
              </li>
            );
          })}
        </ul>

        {/* Premium button — always a signup/pricing prompt for anonymous
            users, an upsell CTA for authenticated ones. */}
        <button
          onClick={onProtectedClick}
          className="mt-3 w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[#c4c2d4] hover:bg-[#151519] hover:text-white transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Crown className="h-4 w-4 text-pink-400" />
            <span className="font-medium">Premium</span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-500 text-white">
            -55%
          </span>
        </button>
      </nav>

      {/* Bottom secondary nav */}
      <div className="border-t border-[#1e1e26] py-3 px-3">
        <ul className="space-y-0.5">
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-[#8a8a99] hover:text-white hover:bg-[#151519] transition-all"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 px-3 flex items-center gap-3 text-[10px] text-[#5a5a66]">
          <Link href="/terms" className="hover:text-[#c4c2d4]">
            Legal Terms
          </Link>
          <span>·</span>
          <Link href="/safety" className="hover:text-[#c4c2d4]">
            Trust &amp; Safety
          </Link>
        </div>
      </div>
    </aside>
  );
}
