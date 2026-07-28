"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, CreditCard, User } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { logoutAction } from "../actions/logout.action";

export interface SessionUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly role: string;
}

interface Props {
  user: SessionUser;
}

/**
 * Authenticated user menu — replaces the Login/Signup buttons in the top bar
 * once a session exists. Mirrors the candy.ai reference: My Profile /
 * Subscription / Settings / Logout, with the account initial as the trigger.
 */
export function UserMenu({ user }: Props) {
  const [isPending, startTransition] = useTransition();

  const displayName = user.name?.trim() || user.email?.split("@")[0] || "Account";
  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    startTransition(() => {
      void logoutAction();
    });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-full",
            "border border-[#2a2a34] bg-[#131318] text-white",
            "hover:border-pink-500/60 hover:bg-[#1a1a22] transition-colors cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-pink-500/40",
          )}
          aria-label="Account menu"
        >
          <span
            aria-hidden
            className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 text-white text-xs font-bold shadow"
          >
            {initial}
          </span>
          <span className="text-sm font-medium max-w-32 truncate hidden sm:inline">
            My Profile
          </span>
          <ChevronDown className="h-4 w-4 text-[#8a8a99]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 min-w-56 rounded-xl border border-[#2a2a34] bg-[#131318] shadow-2xl overflow-hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="px-3 py-3 border-b border-[#1e1e26]">
            <p className="text-sm font-semibold text-white truncate">
              {displayName}
            </p>
            {user.email && (
              <p className="text-xs text-[#8a8a99] truncate">{user.email}</p>
            )}
          </div>

          <div className="py-1">
            <MenuItem icon={User} label="My Profile" disabled />
            <MenuItem icon={CreditCard} label="Subscription" disabled />
            <MenuItem icon={Settings} label="Settings" disabled />
          </div>

          <DropdownMenu.Separator className="h-px bg-[#1e1e26]" />

          <div className="py-1">
            <DropdownMenu.Item
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              disabled={isPending}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-sm text-red-300 cursor-pointer outline-none",
                "data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-200",
                "data-[disabled]:opacity-60 data-[disabled]:cursor-not-allowed",
              )}
            >
              <LogOut className="h-4 w-4" />
              {isPending ? "Signing out…" : "Logout"}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
}

function MenuItem({ icon: Icon, label, disabled }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-sm text-[#c4c2d4] outline-none cursor-pointer",
        "data-[highlighted]:bg-[#1a1a22] data-[highlighted]:text-white",
        "data-[disabled]:text-[#5a5a66] data-[disabled]:cursor-not-allowed",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {disabled && (
        <span className="ml-auto text-[10px] uppercase tracking-wide text-[#5a5a66]">
          Soon
        </span>
      )}
    </DropdownMenu.Item>
  );
}
