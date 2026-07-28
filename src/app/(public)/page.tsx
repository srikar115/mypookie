"use client";

import { HeroCarousel } from "@/components/public/home/HeroCarousel";
import { CharacterAvatars } from "@/components/public/home/CharacterAvatars";
import { NewExperiences } from "@/components/public/home/NewExperiences";
import { CharactersGrid } from "@/components/public/home/CharactersGrid";
import { CreateCTA } from "@/components/public/home/CreateCTA";
import { FAQSection } from "@/components/public/home/FAQSection";
import { InfoSections } from "@/components/public/home/InfoSections";
import { usePublicShell } from "@/components/public/PublicShell";

export default function HomePage() {
  const { openLogin } = usePublicShell();

  return (
    <div className="min-h-screen">
      <div className="max-w-350 mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-10 md:space-y-14">
        <HeroCarousel onCtaClick={openLogin} />
        <CharacterAvatars onClick={openLogin} />
        <NewExperiences onCardClick={openLogin} />
        <CharactersGrid onCardClick={openLogin} />
        <CreateCTA onClick={openLogin} />
        <FAQSection />
        <InfoSections />
      </div>
    </div>
  );
}
