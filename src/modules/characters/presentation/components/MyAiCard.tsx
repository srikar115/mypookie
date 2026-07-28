"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { CharacterSummaryDto } from "@/modules/characters";

interface Props {
  readonly character: CharacterSummaryDto;
}

/**
 * Single companion tile on the /my-ai gallery. Mirrors candy.ai's card:
 * portrait image, "V{version}" badge top-left, quick-chat button top-right,
 * and a bottom overlay with name, age, and short bio. The card itself
 * links to /chat with the companion pre-selected; the chat button is a
 * nested link that stops the outer click.
 */
export function MyAiCard({ character }: Props) {
  const router = useRouter();
  const chatHref = `/chat?with=${encodeURIComponent(character.id)}`;
  const version = character.imageVersion ?? 1;
  const description =
    character.bio && character.bio.trim().length > 0
      ? character.bio.trim()
      : character.tagline?.trim() ?? "No bio yet — start a chat to bring her to life.";

  return (
    <Link
      href={chatHref}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[#2a2a34] bg-[#131318] transition-[border,box-shadow,transform] hover:border-pink-500/40 hover:shadow-[0_20px_50px_-15px_rgba(236,72,153,0.5)] hover:-translate-y-0.5"
    >
      {character.imageUrl ? (
        // Raw <img> to skip next/image remotePatterns config for R2.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={character.imageUrl}
          alt={character.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-500/40 to-purple-600/40 text-6xl font-semibold text-white">
          {character.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}

      <span className="absolute left-3 top-3 rounded-md bg-pink-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-[0_2px_8px_rgba(236,72,153,0.4)]">
        V{version}
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(chatHref);
        }}
        aria-label={`Chat with ${character.name}`}
        title={`Chat with ${character.name}`}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 text-white shadow-[0_4px_12px_rgba(236,72,153,0.5)] transition-colors hover:bg-pink-600"
      >
        <MessageCircle className="h-4 w-4" />
      </button>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-4 pt-14">
        <h3 className="text-lg font-semibold text-white leading-tight">
          {character.name}
        </h3>
        <p className="mt-0.5 text-xs text-white/70">
          {character.ageYears} years
        </p>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/85">
          {description}
        </p>
      </div>
    </Link>
  );
}
