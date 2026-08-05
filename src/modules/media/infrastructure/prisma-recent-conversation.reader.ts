import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  ConversationTurn,
  RecentConversationReader,
} from "../application/ports/recent-conversation-reader";

export class PrismaRecentConversationReader
  implements RecentConversationReader
{
  constructor(private readonly db: PrismaClient) {}

  async listRecentTurns(
    conversationId: string,
    limit: number,
  ): Promise<ConversationTurn[]> {
    const rows = await this.db.message.findMany({
      where: {
        conversationId,
        role: { in: ["USER", "ASSISTANT"] },
        // Empty assistant rows are photo bubbles and in-flight placeholders.
        // Neither says anything about what she is doing, and a run of them
        // would crowd out the turns that do.
        content: { not: "" },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { role: true, content: true },
    });

    return rows.reverse().map((r) => ({
      role: r.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: r.content,
    }));
  }
}
