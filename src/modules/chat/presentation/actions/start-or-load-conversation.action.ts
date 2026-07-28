"use server";

import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import { createStartOrLoadConversationUseCase } from "../../composition/chat.dependencies";
import { ChatCharacterUnavailableError } from "../../domain/errors";
import type { ConversationDto } from "../../application/dto/conversation.dto";

const inputSchema = z.object({
  characterId: z.string().uuid("characterId must be a valid uuid"),
});

export type StartOrLoadConversationResult =
  | { ok: true; conversation: ConversationDto }
  | { ok: false; error: string };

/**
 * Server Action — returns the (single) conversation between the caller and
 * the given character, creating it lazily on the first call.
 */
export async function startOrLoadConversationAction(
  raw: unknown,
): Promise<StartOrLoadConversationResult> {
  const ctx = await getServerContext();
  if (!ctx.actor) {
    return { ok: false, error: "You must be signed in to chat." };
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const useCase = createStartOrLoadConversationUseCase(ctx);
    const conversation = await useCase.execute({
      actorUserId: ctx.actor.id,
      characterId: parsed.data.characterId,
    });
    return { ok: true, conversation };
  } catch (e) {
    if (e instanceof ChatCharacterUnavailableError) {
      return {
        ok: false,
        error: "This companion is not available to chat with.",
      };
    }
    console.error("[startOrLoadConversationAction]", e);
    return { ok: false, error: "Failed to open the conversation." };
  }
}
