"use client";

import { Calendar, Sparkles, User, Briefcase } from "lucide-react";
import type { CharacterSummaryDto } from "@/modules/characters";

interface Props {
  readonly character: CharacterSummaryDto;
}

/**
 * Right column — character detail card. Mirrors candy.ai's profile panel:
 * hero image + "V2" style badge, name, relationship pill, description,
 * and a grid of quick facts (age / body / etc.). We only surface data
 * that's already on CharacterSummaryDto so this component stays cheap
 * and doesn't force the sidebar query to fetch full CharacterDto rows.
 */
export function ChatDetail({ character }: Props) {
  return (
    <aside className="w-[22rem] shrink-0 border-l border-[#1e1e26] bg-[#0d0d13] overflow-y-auto hidden lg:block">
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {character.imageUrl ? (
          // Raw <img> to avoid a next/image remotePatterns config for R2.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.imageUrl}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-500/40 to-purple-600/40 text-6xl font-semibold text-white">
            {character.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-pink-300 backdrop-blur-sm">
          V1
        </span>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0d0d13] to-transparent" />
      </div>

      <div className="px-5 py-5">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold text-white">{character.name}</h3>
          <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-medium text-pink-400">
            {character.relationshipLabel}
          </span>
        </div>

        {character.tagline ? (
          <p className="mt-2 text-sm text-[#c4c2d4] leading-relaxed">
            {character.tagline}
          </p>
        ) : null}

        <div className="mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a99]">
            About me
          </h4>
          <ul className="mt-3 space-y-2.5 text-sm text-[#c4c2d4]">
            <DetailRow
              icon={<Briefcase className="h-4 w-4" />}
              label="Occupation"
              value={character.occupationLabel}
            />
            <DetailRow
              icon={<Sparkles className="h-4 w-4" />}
              label="Personality"
              value={character.personalityLabel}
            />
            <DetailRow
              icon={<User className="h-4 w-4" />}
              label="Relationship"
              value={character.relationshipLabel}
            />
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Created"
              value={new Date(character.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
          </ul>
        </div>
      </div>
    </aside>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a22] text-pink-400">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-[#6b6b76]">
          {label}
        </p>
        <p className="truncate text-sm text-white">{value}</p>
      </div>
    </li>
  );
}
