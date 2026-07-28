import "server-only";
import type { Message, MessageRole, PrismaClient } from "@prisma/client";
import type { MessageRepository } from "../application/ports/message-repository";
import type { MessageDto } from "../application/dto/message.dto";

export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRecent(
    conversationId: string,
    limit: number,
  ): Promise<MessageDto[]> {
    // Fetch newest-first then reverse — Postgres uses the
    // (conversationId, createdAt) btree either way.
    const rows = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse().map(toDto);
  }

  async listByConversation(input: {
    conversationId: string;
    limit: number;
    beforeCreatedAt?: Date;
  }): Promise<MessageDto[]> {
    const rows = await this.db.message.findMany({
      where: {
        conversationId: input.conversationId,
        ...(input.beforeCreatedAt
          ? { createdAt: { lt: input.beforeCreatedAt } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return rows.map(toDto);
  }

  async append(input: {
    id: string;
    conversationId: string;
    role: MessageRole;
    content: string;
    now: Date;
  }): Promise<MessageDto> {
    const row = await this.db.message.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        role: input.role,
        status: "READY",
        content: input.content,
        createdAt: input.now,
      },
    });
    return toDto(row);
  }

  async createAssistantPlaceholder(input: {
    id: string;
    conversationId: string;
    modelId: string;
    now: Date;
  }): Promise<MessageDto> {
    const row = await this.db.message.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        role: "ASSISTANT",
        status: "READY",
        content: "",
        modelId: input.modelId,
        createdAt: input.now,
      },
    });
    return toDto(row);
  }

  async finalizeAssistant(input: {
    id: string;
    content: string;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<MessageDto> {
    const row = await this.db.message.update({
      where: { id: input.id },
      data: {
        content: input.content,
        status: "READY",
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
      },
    });
    return toDto(row);
  }

  async failAssistant(input: {
    id: string;
    errorMessage: string;
    partialContent?: string;
  }): Promise<MessageDto> {
    const row = await this.db.message.update({
      where: { id: input.id },
      data: {
        status: "FAILED",
        errorMessage: input.errorMessage,
        ...(input.partialContent !== undefined
          ? { content: input.partialContent }
          : {}),
      },
    });
    return toDto(row);
  }

  async countByConversation(conversationId: string): Promise<number> {
    return this.db.message.count({ where: { conversationId } });
  }
}

function toDto(row: Message): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    status: row.status,
    content: row.content,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    modelId: row.modelId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}
