import "server-only";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";

/**
 * ChatMessage — provider-agnostic message shape passed to {@link ChatLlm}.
 * We deliberately mirror OpenAI's role names ('system' | 'user' | 'assistant')
 * because every OpenAI-compatible provider (OpenRouter, DeepInfra, Anyscale,
 * Together, etc.) speaks this dialect. Our DB stores the UPPER-CASE variant;
 * the caller lowercases on the way in.
 */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * Optional per-call knobs that override whatever came in on
 * {@link ResolvedModel.parameters}. Kept explicit so a use-case can, for
 * example, force `response_format: json_object` when it needs a structured
 * reply without mutating the DB row.
 */
export interface ChatLlmCallOverrides {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  /** Force a JSON-only response (OpenAI/OpenRouter `response_format`). */
  readonly jsonMode?: boolean;
}

export interface ChatLlmGenerateInput {
  readonly model: ResolvedModel;
  readonly messages: readonly ChatMessage[];
  readonly overrides?: ChatLlmCallOverrides;
  readonly signal?: AbortSignal;
}

export interface ChatLlmStreamInput {
  readonly model: ResolvedModel;
  readonly messages: readonly ChatMessage[];
  readonly overrides?: ChatLlmCallOverrides;
  readonly signal?: AbortSignal;
}

export interface ChatLlmGenerateResult {
  readonly content: string;
  readonly modelId: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

/**
 * ChatLlm — provider-agnostic port for chat-completion style LLMs. The whole
 * point of exposing `stream / generate / generateJson` (rather than one
 * do-everything method) is ISP: extractors + summarizers only need
 * `generateJson` / `generate`; the streaming route only needs `stream`.
 *
 * DIP: use cases depend on this port, never on the OpenAI SDK directly.
 */
export interface ChatLlm {
  /**
   * Streams text deltas as an async iterable. The caller is responsible for
   * accumulating the full text and persisting it. Yields plain strings (the
   * incremental text chunks) — richer event shape lives in the caller.
   *
   * Returns a Promise because the initial HTTP handshake is async; iterate
   * the resolved value with `for await (const delta of await llm.stream(...))`.
   */
  stream(input: ChatLlmStreamInput): Promise<AsyncIterable<string>>;

  /**
   * Non-streaming completion. Used by the session summarizer (which prefers a
   * single well-formed reply over a UX-facing stream).
   */
  generate(input: ChatLlmGenerateInput): Promise<ChatLlmGenerateResult>;

  /**
   * Non-streaming completion with JSON mode forced ON. Used by the memory
   * fact extractor. Returns the raw JSON string; the caller parses.
   */
  generateJson(input: ChatLlmGenerateInput): Promise<ChatLlmGenerateResult>;
}
