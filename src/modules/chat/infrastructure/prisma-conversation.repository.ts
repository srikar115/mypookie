import "server-only";
import type { Conversation, PrismaClient } from "@prisma/client";
import type { ConversationRepository } from "../application/ports/conversation-repository";
import type { ConversationDto } from "../application/dto/conversation.dto";

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUserAndCharacter(
    userId: string,
    characterId: string,
  ): Promise<ConversationDto | null> {
    const row = await this.db.conversation.findUnique({
      where: { userId_characterId: { userId, characterId } },
    });
    return row ? toDto(row) : null;
  }

  async findById(id: string): Promise<ConversationDto | null> {
    const row = await this.db.conversation.findUnique({ where: { id } });
    return row ? toDto(row) : null;
  }

  async startOrLoad(input: {
    id: string;
    userId: string;
    characterId: string;
    now: Date;
  }): Promise<ConversationDto> {
    const row = await this.db.conversation.upsert({
      where: {
        userId_characterId: {
          userId: input.userId,
          characterId: input.characterId,
        },
      },
      update: {},
      create: {
        id: input.id,
        userId: input.userId,
        characterId: input.characterId,
        lastMessageAt: input.now,
      },
    });
    return toDto(row);
  }

  async touchLastMessage(conversationId: string, at: Date): Promise<void> {
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: at },
    });
  }
}

function toDto(row: Conversation): ConversationDto {
  return {
    id: row.id,
    userId: row.userId,
    characterId: row.characterId,
    title: row.title,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
