import "server-only";
import type { PrismaClient } from "@prisma/client";
import { err, ok, type Result } from "@/shared/application/result";
import { LookupNotFoundError } from "../domain/errors";
import type { LookupResolver } from "../application/use-cases/create-character-draft.use-case";

/**
 * Resolves the four lookup slugs the wizard submits (personality,
 * relationship, occupation, voice) to their IDs and prompt fragments.
 * Fails fast with LookupNotFoundError so we never persist an orphan FK.
 */
export class PrismaLookupResolver implements LookupResolver {
  constructor(private readonly db: PrismaClient) {}

  async resolve(input: {
    personalitySlug: string;
    relationshipSlug: string;
    occupationSlug: string;
    voiceSlug: string;
  }): Promise<
    Result<
      {
        personality: { id: string; displayName: string; promptFragment: string };
        relationship: { id: string; displayName: string; promptFragment: string };
        occupation: { id: string; displayName: string; promptFragment: string };
        voice: { id: string; displayName: string };
      },
      LookupNotFoundError
    >
  > {
    const [personality, relationship, occupation, voice] = await Promise.all([
      this.db.personalityArchetype.findUnique({
        where: { slug: input.personalitySlug },
        select: { id: true, displayName: true, promptFragment: true },
      }),
      this.db.relationshipArchetype.findUnique({
        where: { slug: input.relationshipSlug },
        select: { id: true, displayName: true, promptFragment: true },
      }),
      this.db.characterOccupation.findUnique({
        where: { slug: input.occupationSlug },
        select: { id: true, displayName: true, promptFragment: true },
      }),
      this.db.voicePreset.findUnique({
        where: { slug: input.voiceSlug },
        select: { id: true, displayName: true },
      }),
    ]);

    if (!personality) return err(new LookupNotFoundError("personality", input.personalitySlug));
    if (!relationship) return err(new LookupNotFoundError("relationship", input.relationshipSlug));
    if (!occupation) return err(new LookupNotFoundError("occupation", input.occupationSlug));
    if (!voice) return err(new LookupNotFoundError("voice", input.voiceSlug));

    return ok({ personality, relationship, occupation, voice });
  }
}
