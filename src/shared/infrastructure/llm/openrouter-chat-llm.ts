import "server-only";
import OpenAI from "openai";
import type {
  ChatLlm,
  ChatLlmCallOverrides,
  ChatLlmGenerateInput,
  ChatLlmGenerateResult,
  ChatLlmStreamInput,
  ChatMessage,
} from "@/shared/application/llm/chat-llm";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";
import { env } from "@/config/env";

/**
 * OpenAI-compatible adapter that talks to OpenRouter (or any provider that
 * speaks the OpenAI wire format — DeepInfra, Anyscale, Together, etc.). The
 * `endpoint` field on {@link ResolvedModel} controls the base URL, so
 * flipping a `model_configs` row from OpenRouter → DeepInfra is a SQL edit,
 * not a code change.
 *
 * Header conventions ({@link https://openrouter.ai/docs OpenRouter docs}):
 *   - `HTTP-Referer` and `X-Title` are shown on OpenRouter's activity page
 *     and help debug quota issues. Neither is sent to the model.
 */
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterChatLlm implements ChatLlm {
  async stream(input: ChatLlmStreamInput): Promise<AsyncIterable<string>> {
    const client = this.clientFor(input.model);
    const { messages, params } = this.buildRequest(input.model, input.messages, input.overrides);

    const stream = await client.chat.completions.create(
      {
        model: input.model.modelId,
        messages,
        stream: true,
        ...params,
      },
      { signal: input.signal },
    );

    return (async function* () {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    })();
  }

  async generate(input: ChatLlmGenerateInput): Promise<ChatLlmGenerateResult> {
    return this.generateInternal(input, false);
  }

  async generateJson(input: ChatLlmGenerateInput): Promise<ChatLlmGenerateResult> {
    return this.generateInternal(input, true);
  }

  private async generateInternal(
    input: ChatLlmGenerateInput,
    forceJson: boolean,
  ): Promise<ChatLlmGenerateResult> {
    const client = this.clientFor(input.model);
    const overrides: ChatLlmCallOverrides = forceJson
      ? { ...(input.overrides ?? {}), jsonMode: true }
      : (input.overrides ?? {});
    const { messages, params } = this.buildRequest(input.model, input.messages, overrides);

    const res = await client.chat.completions.create(
      {
        model: input.model.modelId,
        messages,
        stream: false,
        ...params,
      },
      { signal: input.signal },
    );

    const choice = res.choices[0];
    const content = choice?.message?.content ?? "";
    return {
      content,
      modelId: input.model.modelId,
      tokensIn: res.usage?.prompt_tokens ?? null,
      tokensOut: res.usage?.completion_tokens ?? null,
    };
  }

  private clientFor(model: ResolvedModel): OpenAI {
    return new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: model.endpoint ?? DEFAULT_OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
        "X-Title": env.NEXT_PUBLIC_APP_NAME,
      },
    });
  }

  /**
   * Merges the model's default parameters with per-call overrides. Explicit
   * overrides always win. `response_format` is honoured via `jsonMode`.
   */
  private buildRequest(
    model: ResolvedModel,
    messages: readonly ChatMessage[],
    overrides: ChatLlmCallOverrides | undefined,
  ): {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    params: Record<string, unknown>;
  } {
    const modelParams = model.parameters;
    const params: Record<string, unknown> = {};

    // Merge model defaults first (all keys we know about).
    if (typeof modelParams.temperature === "number") params.temperature = modelParams.temperature;
    if (typeof modelParams.top_p === "number") params.top_p = modelParams.top_p;
    if (typeof modelParams.max_tokens === "number") params.max_tokens = modelParams.max_tokens;
    if (
      modelParams.response_format &&
      typeof modelParams.response_format === "object"
    ) {
      params.response_format = modelParams.response_format;
    }

    // Overrides take precedence.
    if (overrides?.temperature !== undefined) params.temperature = overrides.temperature;
    if (overrides?.topP !== undefined) params.top_p = overrides.topP;
    if (overrides?.maxTokens !== undefined) params.max_tokens = overrides.maxTokens;
    if (overrides?.jsonMode) params.response_format = { type: "json_object" };

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      messages.map((m) => ({ role: m.role, content: m.content }));

    return { messages: openaiMessages, params };
  }
}
