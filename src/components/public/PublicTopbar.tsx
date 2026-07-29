"use client";

import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu, type SessionUser } from "@/modules/identity/client";

interface PublicTopbarProps {
  user: SessionUser | null;
  onLoginClick: () => void;
  onSignupClick: () => void;
  onMobileMenuClick: () => void;
}

export function PublicTopbar({
  user,
  onLoginClick,
  onSignupClick,
  onMobileMenuClick,
}: PublicTopbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b border-[#1e1e26] bg-[#0a0a0f]/95 backdrop-blur-xl z-50">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuClick}
            className="md:hidden text-[#c4c2d4] hover:text-white cursor-pointer"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>

          <Link href="/" className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold">
              a
            </div>
            <span className="text-lg font-bold text-white">
              amorify<span className="text-pink-400">.ai</span>
            </span>
          </Link>
        </div>

        <nav className="hidden sm:flex items-center gap-1">
          <Link
            href="/create"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#c4c2d4] hover:text-white transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Create Character
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Button
                size="sm"
                onClick={onSignupClick}
                className="hidden sm:inline-flex"
              >
                Create Free Account
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onLoginClick}
                className="border-pink-500/40 text-pink-400 hover:bg-pink-500/10 hover:border-pink-500/60"
              >
                Login
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
