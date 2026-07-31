import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { CallSessionRepository } from "../ports/call-session-repository";
import type {
  ChatLlm,
  ChatMessage as LlmMessage,
} from "@/shared/application/llm/chat-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import { CallSessionNotFoundError } from "../../domain/errors";

/**
 * SummarizeCall — 2-sentence recap of a completed call. Persisted onto
 * `call_sessions.summary` and later folded into the memory block on
 * subsequent chats so the character can naturally say "That was a nice
 * call yesterday — how are you feeling now?"
 *
 * Cheap by design: uses the SUMMARIZER model (already tuned for short
 * recaps) rather than the more expensive CHAT model.
 *
 * Runs in `after()` off the /call/end route so end-of-call latency
 * remains sub-second even though the LLM call takes 1-2s.
 */
export class SummarizeCallUseCase {
  constructor(
    private readonly db: PrismaClient,
    private readonly callSessions: CallSessionRepository,
    private readonly llm: ChatLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async execute(input: { callSessionId: string }): Promise<string | null> {
    const session = await this.callSessions.findById(input.callSessionId);
    if (!session) throw new CallSessionNotFoundError(input.callSessionId);
    if (!session.endedAt) return null; // don't summarize an open call
    if (session.turnCount === 0) return null; // nothing to say

    // Pull the last 20 voice turns for context. Voice turns are marked
    // `source=VOICE`, but we also include any interleaved text turns from
    // within the call window so a text-side barge-in doesn't confuse the
    // recap.
    const start = new Date(session.startedAt);
    const end = new Date(session.endedAt);
    const rows = await this.db.message.findMany({
      where: {
        conversationId: session.conversationId,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { role: true, content: true },
    });
    if (rows.length === 0) return null;

    const model = await this.models.resolve("SUMMARIZER");

    const messages: LlmMessage[] = [
      {
        role: "system",
        content:
          "Summarize the voice call between the user and the AI companion in 2 sentences. " +
          "Focus on emotional tone and any specific facts the user shared (dates, plans, feelings). " +
          "Neutral third-person past tense. No dialogue quotes.",
      },
      {
        role: "user",
        content: rows
          .map(
            (m) => `${m.role === "USER" ? "User" : "Companion"}: ${m.content}`,
          )
          .join("\n"),
      },
    ];

    const result = await this.llm.generate({
      model,
      messages,
      overrides: { temperature: 0.4, maxTokens: 200 },
    });

    const clean = result.content.trim();
    if (clean.length === 0) return null;
    await this.callSessions.setSummary(session.id, clean);
    return clean;
  }
}
