import "server-only";
import type { NextRequest } from "next/server";
import { getServerContext } from "@/composition/server-context";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  createAppendAssistantMessageUseCase,
  createBuildOpenerContextUseCase,
  sanitizeAssistantReply,
} from "@/modules/chat";
import { createAssembleContextUseCase } from "@/modules/memory";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import {
  classifyLlmError,
  isTransientLlmError,
} from "@/shared/infrastructure/llm/llm-error-classifier";
import { env } from "@/config/env";

/**
 * Character-initiated opener route.
 *
 * The client fires this a few seconds after the chat view mounts if
 * the user hasn't typed anything AND either (a) the thread is empty
 * or (b) the last message is stale enough that a re-opener is warm
 * rather than pushy. See `ChatConversation` for the exact policy.
 *
 * This route is intentionally NOT SSE:
 *
 *   - Openers are short (1-2 sentences) and we no longer render
 *     partial deltas live (see the buffered-reveal change in
 *     useChatStream). SSE would add complexity for zero visible
 *     benefit.
 *   - JSON keeps the client trivially small: fire, await, splice
 *     the new bubble in.
 *
 * Server-side buffering: we still call `llm.stream()` and accumulate
 * every delta into a string, because the underlying OpenAI-SDK
 * adapter is streaming-only. Cost is identical to a non-streamed
 * completion.
 *
 * Persistence flow mirrors the main stream route:
 *   1. Prepare placeholder assistant row (empty content, model
 *      snapshot). If anything downstream fails we `fail()` it so the
 *      DB never carries orphan empties.
 *   2. Consume the LLM stream into a single string.
 *   3. `finalize()` the row with the content.
 *   4. Return the row to the caller as JSON.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await ctx.params;

  const server = await getServerContext();
  if (!server.actor) {
    return jsonError(401, "You must be signed in to chat.", "UNAUTHENTICATED");
  }

  const memoryProvider = createAssembleContextUseCase(server);
  const buildOpener = createBuildOpenerContextUseCase(server, memoryProvider);

  let built;
  try {
    built = await buildOpener.execute({
      actorUserId: server.actor.id,
      conversationId,
      actorDisplayName: server.actor.displayName,
    });
  } catch (e) {
    return handleDomainError(e);
  }

  let chatModel;
  try {
    chatModel = await server.models.resolve("CHAT");
  } catch (e) {
    console.error("[chat.opener] failed to resolve CHAT model", e);
    return jsonError(500, "Chat model is not configured.", "MODEL_UNAVAILABLE");
  }

  const appendAssistant = createAppendAssistantMessageUseCase(server);
  const placeholder = await appendAssistant.preparePlaceholder({
    conversationId,
    modelId: chatModel.modelId,
  });

  // Server-side buffered generation. The LLM adapter is streaming-only
  // (single shared code path with the /stream route), but we consume
  // the whole iterable here so the client gets one clean JSON reply.
  const llm = new OpenRouterChatLlm();
  let content = "";
  try {
    const tokenIter = await openStreamWithRetry(llm, {
      model: chatModel,
      messages: built.messages,
      overrides: {
        temperature: env.CHAT_TEMPERATURE,
        // Cap opener length hard — openers should be a beat, not a
        // wall of text, even if the model tries to be effusive. 200
        // tokens ≈ 3 sentences with room to spare.
        maxTokens: 200,
      },
      signal: request.signal,
    });
    for await (const delta of tokenIter) {
      content += delta;
    }
  } catch (e) {
    const { code, loggable } = classifyLlmError(e);
    console.warn(
      `[chat.opener] upstream failed (code=${code}) — ${loggable}`,
    );
    await appendAssistant.fail({
      messageId: placeholder.id,
      errorMessage: `code=${code}; ${loggable}`,
    });
    return jsonError(
      502,
      "The character couldn't come up with a greeting right now.",
      code,
    );
  }

  // Same scrub as the main stream route — the model occasionally copies
  // the composer's `[voice call]`/`[text chat]` history annotations into
  // its own output.
  const finalContent = sanitizeAssistantReply(content.trim());

  // Dedupe backstop: revisit openers occasionally regenerate the
  // previous assistant message verbatim (same history in → same
  // tokens out, even at temperature). The composer now forbids it in
  // the prompt, but prompt rules are probabilistic — this check is
  // the deterministic net. If the new opener is essentially the same
  // as the character's last message, drop it silently: the client
  // treats `skipped` as "no opener this time", which is strictly
  // better UX than a visible duplicate.
  const lastAssistant = [...built.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  if (lastAssistant && isNearDuplicate(finalContent, lastAssistant.content)) {
    console.info(
      `[chat.opener] suppressed near-duplicate opener (conversation=${conversationId})`,
    );
    await appendAssistant.fail({
      messageId: placeholder.id,
      errorMessage: "duplicate_opener_suppressed",
    });
    return Response.json({ ok: true, skipped: true });
  }

  if (finalContent.length === 0) {
    // Empty completion. Most common cause: the model's chat template
    // requires a trailing user turn (see `composeOpener` in the
    // composer). If this fires despite that fix, something more
    // interesting is happening — probably a moderation refusal on
    // the character or memory content. Log the raw length + the
    // resolved model so the pattern is diagnosable from a tail of
    // the dev log.
    console.warn(
      `[chat.opener] empty completion (model=${chatModel.modelId}, raw_len=${content.length}) — see composeOpener() if this repeats`,
    );
    await appendAssistant.fail({
      messageId: placeholder.id,
      errorMessage: "empty_completion",
    });
    return jsonError(
      502,
      "The character couldn't come up with a greeting right now.",
      "EMPTY_COMPLETION",
    );
  }

  const finalized = await appendAssistant.finalize({
    messageId: placeholder.id,
    conversationId,
    content: finalContent,
    tokensIn: null,
    tokensOut: null,
  });

  return Response.json({
    ok: true,
    message: {
      id: finalized.id,
      role: "assistant" as const,
      content: finalized.content,
      createdAt: finalized.createdAt,
    },
  });
}

/**
 * Near-duplicate detection for opener suppression. Normalizes away
 * everything that isn't semantic content (asterisk beats, emoji-ish
 * symbols, punctuation, case, whitespace) then checks exact equality
 * or full containment. Deliberately conservative — a false positive
 * here silently swallows a legitimate opener, so we only trigger on
 * unmistakable repeats.
 */
function isNearDuplicate(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\*[^*\n]{1,200}\*/g, "")
      .replace(/^\[voice call\]\s*/i, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (na.length < 20 || nb.length < 20) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function jsonError(
  status: number,
  message: string,
  code: string,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function handleDomainError(e: unknown): Response {
  if (e instanceof ConversationNotFoundError) {
    return jsonError(404, "Conversation not found.", "NOT_FOUND");
  }
  if (e instanceof ConversationAccessDeniedError) {
    return jsonError(403, "You do not own this conversation.", "FORBIDDEN");
  }
  if (e instanceof ChatCharacterUnavailableError) {
    return jsonError(410, "This companion is not available.", "GONE");
  }
  console.error("[chat.opener]", e);
  return jsonError(500, "Unexpected server error.", "UNKNOWN");
}

/**
 * Same retry topology as the streaming route — 3 attempts, 500ms /
 * 1500ms backoffs with ±15% jitter. Kept a local copy rather than
 * extracting into shared/infrastructure because that file already
 * carries the classifier + the streaming route uses this shape;
 * lifting it would be a churn for churn's sake.
 */
async function openStreamWithRetry(
  llm: OpenRouterChatLlm,
  args: Parameters<OpenRouterChatLlm["stream"]>[0],
): Promise<AsyncIterable<string>> {
  const MAX_ATTEMPTS = 3;
  const BASE_DELAYS_MS = [0, 500, 1500];
  let lastErr: unknown = new Error("no attempts made");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const delay = BASE_DELAYS_MS[attempt];
    if (delay > 0) {
      const jittered = Math.round(delay * (0.85 + Math.random() * 0.3));
      await new Promise((r) => setTimeout(r, jittered));
    }
    try {
      return await llm.stream(args);
    } catch (e) {
      lastErr = e;
      if (!isTransientLlmError(e)) break;
      const { code, loggable } = classifyLlmError(e);
      console.warn(
        `[chat.opener] transient upstream error (attempt ${attempt + 1}/${MAX_ATTEMPTS}, code=${code}): ${loggable}`,
      );
    }
  }
  throw lastErr;
}
