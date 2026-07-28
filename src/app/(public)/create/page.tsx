import { getServerContext } from "@/composition/server-context";
import { createGetCharacterLookupsUseCase } from "@/modules/characters";
import { CharacterWizard } from "@/modules/characters/client";
import { fetchCharacterAction } from "./_fetch-character.action";

/**
 * /create — the character creation wizard entry point.
 *
 * We load the wizard's lookup lists server-side so the initial paint has
 * everything it needs. The client then holds the transient wizard state
 * and calls Server Actions on step transitions (create draft / regen /
 * commit).
 */

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const ctx = await getServerContext();
  const getLookups = createGetCharacterLookupsUseCase(ctx);
  const lookups = await getLookups.execute({
    nsfwAllowed: ctx.actor !== null,
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            Create your AI companion
          </h1>
          <p className="mt-2 text-[#c4c2d4]">
            Pick a style, define her look, and give her a personality.
          </p>
        </div>
      </div>
      <CharacterWizard lookups={lookups} fetchCharacter={fetchCharacterAction} />
    </div>
  );
}
