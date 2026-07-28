"use server";

import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import { createListMessagesUseCase } from "../../composition/chat.dependencies";
import {
  ConversationAccessDeniedError,
  ConversationNotFoundError,
} from "../../domain/errors";
import type { MessageDto } from "../../application/dto/message.dto";

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.number().int().positive().max(200).default(50).optional(),
});

export type ListMessagesResult =
  | { ok: true; messages: MessageDto[] }
  | { ok: false; error: string };

/**
 * Server Action — returns the newest N messages of a conversation. Access
 * is gated by ownership; RLS is a defense-in-depth layer, not the primary
 * check.
 */
export async function listMessagesAction(
  raw: unknown,
): Promise<ListMessagesResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) return { ok: false, error: "You must be signed in." };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const useCase = createListMessagesUseCase(ctx);
    const messages = await useCase.execute({
      actorUserId: ctx.actor.id,
      conversationId: parsed.data.conversationId,
      limit: parsed.data.limit ?? 50,
    });
    return { ok: true, messages };
  } catch (e) {
    if (
      e instanceof ConversationNotFoundError ||
      e instanceof ConversationAccessDeniedError
    ) {
      return { ok: false, error: "Conversation not found." };
    }
    console.error("[listMessagesAction]", e);
    return { ok: false, error: "Failed to load messages." };
  }
}
