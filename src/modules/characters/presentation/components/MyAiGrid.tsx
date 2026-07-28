"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { CharacterSummaryDto } from "@/modules/characters";
import { MyAiCard } from "./MyAiCard";

interface Props {
  readonly characters: readonly CharacterSummaryDto[];
}

/**
 * /my-ai gallery. Header + responsive card grid.
 *
 * The very first tile is always the pink "Create new AI" CTA — matching
 * candy.ai's affordance so users can go from "browsing my roster" to
 * "creating a new companion" without leaving the page. Character cards
 * follow, sorted newest-first by the repository query.
 */
export function MyAiGrid({ characters }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          My <span className="text-pink-500">AI</span>
        </h1>
        <p className="mt-2 text-sm text-[#8a8a99]">
          {characters.length === 0
            ? "Create your first AI companion to get started."
            : `${characters.length} ${characters.length === 1 ? "companion" : "companions"}`}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
        <CreateNewCard />
        {characters.map((c) => (
          <MyAiCard key={c.id} character={c} />
        ))}
      </div>
    </div>
  );
}

function CreateNewCard() {
  return (
    <Link
      href="/create"
      className="group relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 text-white transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-15px_rgba(236,72,153,0.6)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br from-pink-400 to-pink-500" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm">
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </div>
      <span className="relative mt-4 text-lg font-semibold">Create new AI</span>
    </Link>
  );
}
