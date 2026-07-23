"use client";

import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a3d]/50 bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/honey-bunny-logo.png" alt="Honey Bunny" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-bold text-gradient">Honey Bunny</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/pricing"
              className="text-sm text-[#9ca3af] hover:text-[#f1f0ff] transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/safety"
              className="text-sm text-[#9ca3af] hover:text-[#f1f0ff] transition-colors"
            >
              Safety
            </Link>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Create Companion</Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#9ca3af] hover:text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-[#2a2a3d] bg-[#0a0a0f]/95 backdrop-blur-xl px-4 py-4 space-y-3">
          <Link
            href="/pricing"
            className="block text-sm text-[#9ca3af] hover:text-white py-2"
            onClick={() => setIsMenuOpen(false)}
          >
            Pricing
          </Link>
          <Link
            href="/safety"
            className="block text-sm text-[#9ca3af] hover:text-white py-2"
            onClick={() => setIsMenuOpen(false)}
          >
            Safety
          </Link>
          <div className="pt-2 flex flex-col gap-2">
            <Link href="/login" onClick={() => setIsMenuOpen(false)}>
              <Button variant="outline" size="sm" className="w-full">
                Sign In
              </Button>
            </Link>
            <Link href="/signup" onClick={() => setIsMenuOpen(false)}>
              <Button size="sm" className="w-full">
                Create Companion
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
