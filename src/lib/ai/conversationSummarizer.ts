/**
 * Rolling conversation summarizer.
 *
 * As conversations grow past the live context window (`CONTEXT_MESSAGES`),
 * older facts ("we agreed to meet in Goa", "she was wearing the saree last
 * night") silently fall off. This module periodically condenses the older
 * tier into a short markdown summary stored on `Conversation.summary` and
 * injected into the system prompt as `STORY SO FAR`.
 *
 * Design notes:
 *  - Runs in the background after the user-visible reply is finished. The
 *    chat stream never awaits it — even a long summarizer call cannot delay
 *    the response.
 *  - Uses the same OpenRouter setup as the intent router (cheap, fast model).
 *    Fails silently — the chat experience is never blocked by a summary miss.
 *  - Cadence: triggered every `SUMMARIZE_EVERY_N_USER_MESSAGES` user messages.
 *    The summary covers messages OLDER than the live tail so we don't churn
 *    on the messages the system prompt already sees verbatim.
 */

import prisma from "@/lib/db";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_SUMMARIZER_MODEL = "google/gemini-2.5-flash-lite";
const SUMMARIZER_TIMEOUT_MS = 10_000;

/** Trigger a summary refresh every N user messages. */
export const SUMMARIZE_EVERY_N_USER_MESSAGES = 30;

/** Live tail kept out of the summary — must match CONTEXT_MESSAGES in the stream. */
const LIVE_TAIL_MESSAGES = 30;

const SYSTEM_PROMPT = `You are condensing a long roleplay conversation into a short "story so far" recap.

You will see the existing recap (may be empty), followed by a chunk of older messages that are about to drop out of the live context window. Your job is to merge them into a refreshed recap.

Output rules:
- Plain markdown, 6-15 bullet points, < 300 tokens total.
- Cover: relationship tone, agreed-on facts, ongoing threads/promises, important things the user shared about themselves, scenes/locations explored, notable emotional moments.
- Be third-person ("Companion and user agreed to..."), not first-person.
- Preserve specific names, places, outfits, dates the user mentioned.
- Drop small talk and ephemeral details. Keep what would change how the companion treats the user next time.
- If the new chunk doesn't add anything new, return the existing recap unchanged.
- Output ONLY the markdown bullets, no prose preamble, no fences.`;

interface MessageRow {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: Date;
}

function shouldSummarize(
  totalUserMessages: number,
  lastSummarizedMessageId: string | null,
  oldestUnsummarizedMessageId: string | null
): boolean {
  if (totalUserMessages < SUMMARIZE_EVERY_N_USER_MESSAGES) return false;
  if (!oldestUnsummarizedMessageId) return false;
  // First-time summary: always run when we cross the threshold.
  if (!lastSummarizedMessageId) return true;
  return totalUserMessages % SUMMARIZE_EVERY_N_USER_MESSAGES === 0;
}

function formatMessages(rows: MessageRow[], companionName: string): string {
  return rows
    .map((r) => {
      const speaker = r.role === "USER" ? "User" : companionName;
      // Skip our own image/video markers — they don't add story value.
      const text = (r.content ?? "").trim();
      if (!text) return "";
      if (text.startsWith("📸") || text.startsWith("🎬")) {
        return `${speaker}: [shared media]`;
      }
      return `${speaker}: ${text.slice(0, 600)}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Run a summary refresh for this conversation in the background. Safe to call
 * fire-and-forget — all errors are caught and logged.
 */
export async function maybeUpdateConversationSummary(conversationId: string): Promise<void> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        summary: true,
        summaryThroughMessageId: true,
        companion: { select: { name: true } },
      },
    });
    if (!conversation) return;

    // Count user messages cheaply so we only do the heavier work when we're
    // actually due for a refresh.
    const totalUserMessages = await prisma.message.count({
      where: { conversationId, role: "USER" },
    });

    // Identify the oldest message that is NOT already in the summary AND not
    // in the live tail. Those are the messages we need to fold in.
    const messages = await prisma.message.findMany({
      where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    if (messages.length === 0) return;

    // Cutoff: messages older than the live tail are eligible.
    const eligible = messages.slice(0, Math.max(0, messages.length - LIVE_TAIL_MESSAGES));
    if (eligible.length === 0) return;

    // Skip messages already covered by the existing summary.
    const idx = conversation.summaryThroughMessageId
      ? eligible.findIndex((m) => m.id === conversation.summaryThroughMessageId)
      : -1;
    const newSlice = idx >= 0 ? eligible.slice(idx + 1) : eligible;
    if (newSlice.length === 0) return;

    if (
      !shouldSummarize(
        totalUserMessages,
        conversation.summaryThroughMessageId,
        newSlice[0]?.id ?? null
      )
    ) {
      return;
    }

    const companionName = conversation.companion.name ?? "Companion";

    const userPrompt = [
      "Existing recap:",
      conversation.summary?.trim() || "(none yet)",
      "",
      "New older messages to merge in (oldest first):",
      formatMessages(
        newSlice.map((m) => ({
          ...m,
          role: m.role as "USER" | "ASSISTANT" | "SYSTEM",
        })),
        companionName
      ),
      "",
      "Updated recap:",
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SUMMARIZER_TIMEOUT_MS);

    try {
      const model = process.env.SUMMARIZER_MODEL?.trim() || DEFAULT_SUMMARIZER_MODEL;
      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer":
            process.env.OPENROUTER_SITE_URL?.trim() ||
            process.env.NEXT_PUBLIC_APP_URL?.trim() ||
            "http://localhost:3000",
          "X-Title":
            process.env.OPENROUTER_APP_NAME?.trim() ||
            process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
            "HoneyBunny",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 400,
        }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const newSummary = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!newSummary) return;

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          summary: newSummary,
          summaryThroughMessageId: newSlice[newSlice.length - 1].id,
          summaryUpdatedAt: new Date(),
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn(
      "[conversationSummarizer] failed:",
      err instanceof Error ? err.message : err
    );
  }
}
