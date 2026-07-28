import "server-only";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerContext } from "@/composition/server-context";
import {
  ChatCharacterUnavailableError,
  ConversationAccessDeniedError,
  ConversationNotFoundError,
  createAppendAssistantMessageUseCase,
  createAppendUserMessageUseCase,
  createBuildChatContextUseCase,
} from "@/modules/chat";
import {
  createAssembleContextUseCase,
  createIngestTurnUseCase,
} from "@/modules/memory";
import { OpenRouterChatLlm } from "@/shared/infrastructure/llm/openrouter-chat-llm";
import { env } from "@/config/env";

/**
 * SSE streaming route for a single chat turn.
 *
 * Flow (per the plan's sequence diagram):
 *   1. Auth check.
 *   2. Persist USER message → 409 out early if the conversation is missing.
 *   3. Resolve CHAT model via ModelConfig (ctx.models.resolve).
 *   4. Build context (memory block + history + system prompt).
 *   5. Insert placeholder ASSISTANT row (empty content, modelId snapshotted).
 *   6. Open the OpenRouter stream, forward text_delta events to the client.
 *   7. On [DONE], finalize the assistant row and emit `done { messageId }`.
 *   8. after() → IngestTurnUseCase runs the memory pipeline off the hot path.
 *
 * The response is SSE (`text/event-stream`), so clients read line-delimited
 * `data: ...` events with a JSON payload. Client uses fetch + ReadableStream
 * (not EventSource) because EventSource can't POST.
 */

const bodySchema = z.object({
  content: z.string().trim().min(1, "Message content is required.").max(4000),
});

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disables nginx / CDN response buffering so tokens arrive live.
  "X-Accel-Buffering": "no",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await ctx.params;

  const server = await getServerContext();
  if (!server.actor) {
    return jsonError(401, "You must be signed in to chat.");
  }

  let payload: { content: string };
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      );
    }
    payload = parsed.data;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  // 1) Persist USER message. Do this before any LLM cost so authz + validity
  //    failures don't rack up bills.
  const appendUser = createAppendUserMessageUseCase(server);
  let userMessage;
  try {
    userMessage = await appendUser.execute({
      actorUserId: server.actor.id,
      conversationId,
      content: payload.content,
    });
  } catch (e) {
    return handleDomainError(e);
  }

  // 2) Build the chat context. Memory + history + composed prompt.
  const memoryProvider = createAssembleContextUseCase(server);
  const buildContext = createBuildChatContextUseCase(server, memoryProvider);
  let built;
  try {
    built = await buildContext.execute({
      actorUserId: server.actor.id,
      conversationId,
      latestUserMessage: payload.content,
    });
  } catch (e) {
    return handleDomainError(e);
  }

  // 3) Resolve the chat model.
  let chatModel;
  try {
    chatModel = await server.models.resolve("CHAT");
  } catch (e) {
    console.error("[chat.stream] failed to resolve CHAT model", e);
    return jsonError(500, "Chat model is not configured.");
  }

  // 4) Insert the placeholder assistant row so the UI can lock onto its id
  //    while the stream fills in the content.
  const appendAssistant = createAppendAssistantMessageUseCase(server);
  const placeholder = await appendAssistant.preparePlaceholder({
    conversationId,
    modelId: chatModel.modelId,
  });

  // 5) Open the LLM stream.
  const llm = new OpenRouterChatLlm();
  let tokenIter: AsyncIterable<string>;
  try {
    tokenIter = await llm.stream({
      model: chatModel,
      messages: built.messages,
      overrides: {
        temperature: env.CHAT_TEMPERATURE,
        maxTokens: env.CHAT_MAX_TOKENS,
      },
      signal: request.signal,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await appendAssistant.fail({
      messageId: placeholder.id,
      errorMessage: errMsg,
    });
    return jsonError(502, `Upstream LLM failed to start: ${errMsg}`);
  }

  // 6) Set up SSE + after() ingest. Both close over `streamState` so `after`
  //    reads the final content when it fires (after the response ends).
  const streamState = {
    content: "",
    failed: null as string | null,
  };

  after(async () => {
    if (streamState.failed) return;
    if (streamState.content.trim().length === 0) return;
    try {
      const ingestTurn = createIngestTurnUseCase(server);
      // Turn count matches the DB post-write: user + assistant just landed.
      // We don't reload here; the summarizer path re-reads history when it
      // needs the transcript.
      await ingestTurn.execute({
        userId: server.actor!.id,
        characterId: built.character.id,
        characterName: built.character.name,
        conversationId,
        userMessage: payload.content,
        assistantMessage: streamState.content,
        sourceUserMessageId: userMessage.id,
        // Only summarize on turn-count boundaries; +2 for the pair we just
        // wrote (user + assistant). historyTurnCount already excludes both.
        turnCountAfterIngest: built.historyTurnCount + 2,
        recentTurnsForSummary: buildSummarizerTurns(payload.content, streamState.content),
      });
    } catch (e) {
      console.warn("[chat.stream] ingest failed", e);
    }
  });

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SsEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        for await (const delta of tokenIter) {
          streamState.content += delta;
          send({ type: "text_delta", delta });
        }

        await appendAssistant.finalize({
          messageId: placeholder.id,
          conversationId,
          content: streamState.content,
          tokensIn: null,
          tokensOut: null,
        });

        send({ type: "done", messageId: placeholder.id });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        streamState.failed = errMsg;
        try {
          await appendAssistant.fail({
            messageId: placeholder.id,
            errorMessage: errMsg,
            partialContent: streamState.content,
          });
        } catch (finalizeErr) {
          console.warn("[chat.stream] failed to mark assistant FAILED", finalizeErr);
        }
        send({ type: "error", message: errMsg });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client aborted (tab close, navigation). The stream loop's finally
      // block still runs, but we mark failed so ingest short-circuits.
      streamState.failed = streamState.failed ?? "client_aborted";
    },
  });

  return new Response(readable, { status: 200, headers: SSE_HEADERS });
}

type SsEvent =
  | { readonly type: "text_delta"; readonly delta: string }
  | { readonly type: "done"; readonly messageId: string }
  | { readonly type: "error"; readonly message: string };

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function handleDomainError(e: unknown): Response {
  if (e instanceof ConversationNotFoundError) {
    return jsonError(404, "Conversation not found.");
  }
  if (e instanceof ConversationAccessDeniedError) {
    return jsonError(403, "You do not own this conversation.");
  }
  if (e instanceof ChatCharacterUnavailableError) {
    return jsonError(410, "This companion is not available.");
  }
  console.error("[chat.stream]", e);
  return jsonError(500, "Unexpected server error.");
}

/**
 * Just the freshly-completed pair. The summarizer already has the prior
 * summary from the DB, so this is enough context for it to integrate.
 */
function buildSummarizerTurns(
  userContent: string,
  assistantContent: string,
): readonly { role: "user" | "assistant"; content: string }[] {
  return [
    { role: "user", content: userContent },
    { role: "assistant", content: assistantContent },
  ];
}
