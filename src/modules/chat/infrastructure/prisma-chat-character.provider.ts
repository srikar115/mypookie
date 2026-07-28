import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  ChatCharacterProfile,
  ChatCharacterProvider,
} from "../application/ports/chat-character-provider";

/**
 * Loads just the character fields the chat prompt needs. Directly queries
 * the `characters` table + its lookup relations to keep this narrow — chat
 * doesn't need the full CharacterDto's appearance metrics.
 *
 * Ownership check (`ownerUserId === actorUserId`) is done in-query, so the
 * caller can pattern-match on `null` for both "not found" and "not owned"
 * without leaking which is which.
 */
export class PrismaChatCharacterProvider implements ChatCharacterProvider {
  constructor(private readonly db: PrismaClient) {}

  async getForActor(
    characterId: string,
    actorUserId: string,
  ): Promise<ChatCharacterProfile | null> {
    const row = await this.db.character.findFirst({
      where: {
        id: characterId,
        ownerUserId: actorUserId,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        systemPrompt: true,
        tagline: true,
        relationshipArchetype: { select: { displayName: true } },
        personalityArchetype: { select: { displayName: true } },
        occupation: { select: { displayName: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      systemPrompt: row.systemPrompt,
      tagline: row.tagline,
      relationshipLabel: row.relationshipArchetype.displayName,
      personalityLabel: row.personalityArchetype.displayName,
      occupationLabel: row.occupation.displayName,
    };
  }
}
