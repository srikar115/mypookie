"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { LayoutDashboard, Cpu, DollarSign, Users, Shield, Sparkles, Settings, CreditCard, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/companions", label: "Companions", icon: Sparkles },
  { href: "/admin/models", label: "AI Models", icon: Cpu },
  { href: "/admin/plans", label: "Plans", icon: CreditCard },
  { href: "/admin/credit-packs", label: "Credit Packs", icon: Package },
  { href: "/admin/pricing", label: "Pricing Rules", icon: DollarSign },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/moderation", label: "Moderation", icon: Shield },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-[#0c0a06] border-r border-[#2e2818] flex flex-col z-30">
      {/* Logo + admin badge */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[#2e2818]">
        <Image src="/honey-bunny-logo.png" alt="Honey Bunny" width={32} height={32} className="rounded-lg shrink-0" />
        <div>
          <span className="text-sm font-bold text-gradient block leading-tight">Honey Bunny</span>
          <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">Admin</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  : "text-[#6b7280] hover:text-[#c4c2d4] hover:bg-[#1a1a26]"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-amber-400" : "text-[#6b7280]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <Link
          href="/app"
          className="flex items-center gap-2 px-3 py-2 text-sm text-[#6b7280] hover:text-[#c4c2d4] transition-colors"
        >
          <Settings className="h-4 w-4" />
          Back to App
        </Link>
      </div>
    </aside>
  );
}
