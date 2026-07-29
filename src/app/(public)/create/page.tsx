import { getServerContext } from "@/composition/server-context";
import {
  createGetCharacterLookupsUseCase,
  createWizardPreviewRepository,
} from "@/modules/characters";
import { CharacterWizard } from "@/modules/characters/client";

/**
 * /create — the unified Candy.ai-style visual character wizard.
 *
 * We load the wizard's lookup lists AND all wizard preview rows
 * server-side so the initial paint has everything it needs. The full
 * preview table is small (< 1MB even fully populated) and cacheable per
 * (baseStyle, gender) so eagerly shipping it beats a client-side
 * server-action ping mid-wizard.
 *
 * After the final step, the wizard opens the (single) conversation for
 * the new companion and redirects to `/ai-girlfriend/<slug>?conversation_id=<uuid>`
 * — the preview step is gone; the companion is presented inside chat.
 */

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const ctx = await getServerContext();
  const getLookups = createGetCharacterLookupsUseCase(ctx);
  const previewRepo = createWizardPreviewRepository(ctx);

  const [lookups, previews] = await Promise.all([
    getLookups.execute({ nsfwAllowed: ctx.actor !== null }),
    previewRepo.listAll(),
  ]);

  return <CharacterWizard lookups={lookups} previews={previews} />;
}
