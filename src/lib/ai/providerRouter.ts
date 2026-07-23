import { getDefaultModel, getModelBySlug, getModelByCapability } from "./modelRegistry";
import { ModelType } from "@prisma/client";
import type { AiModel, AiProvider } from "@prisma/client";

type ModelWithProvider = AiModel & { provider: AiProvider };

// ─── Interfaces ───────────────────────────────────────────────────────────────

export type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: ChatMessageContent;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  modelSlug?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** Base64 data URL of an image attachment to include with the last user message */
  attachmentDataUrl?: string;
  /** Whether the resolved model supports vision (set by caller) */
  modelSupportsVision?: boolean;
}

export interface ChatResponse {
  content: string;
  modelSlug: string;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed: number;
}

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  style?: string;
  modelSlug?: string;
  /** Deterministic seed for consistent character appearance */
  seed?: number;
  /**
   * One or more reference image URLs (or data URLs) for image-edit / img2img.
   * When set, the router prefers a model marked `capabilities.editEndpoint`
   * over the default text-to-image model. The reference is passed under
   * `settings.referenceImageParam` (e.g. `image_url` or `image_urls`).
   */
  referenceImageUrls?: string[];
}

export interface ImageResponse {
  url: string;
  modelSlug: string;
  width: number;
  height: number;
  creditsUsed: number;
}

export interface VideoRequest {
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  modelSlug?: string;
  /** Deterministic seed for consistent character appearance */
  seed?: number;
  /**
   * Optional first-frame / source image URL for image-to-video models.
   * When set, the router prefers a model marked `capabilities.requiresInputImage`.
   * The image is passed under `settings.inputImageParam` (e.g. `image_url`).
   */
  inputImageUrl?: string;
}

export interface VideoJobResponse {
  jobId: string;
  modelSlug: string;
  status: "queued" | "processing" | "completed" | "failed";
  resultUrl?: string;
  creditsUsed: number;
  /** URL to poll for job status (from fal queue response) */
  statusUrl?: string;
  /** URL to fetch final result (from fal queue response) */
  responseUrl?: string;
}

// ─── Model settings helpers ────────────────────────────────────────────────────

interface ModelSettings {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  defaultInput?: Record<string, unknown>;
  resultPath?: string;
  statusPath?: string;
  /** Name of the parameter to pass aspect ratio as (e.g. "image_size" or "aspect_ratio") */
  aspectRatioParam?: string;
  /** Maps our internal aspect ratio keys to provider-specific values */
  aspectRatioMap?: Record<string, string>;
  /** Available aspect ratios as metadata (used by admin UI) */
  aspectRatios?: string[];
  /**
   * For image-edit / img2img models: param name to pass the reference image(s)
   * under. If the param name ends in "s" (e.g. "image_urls") the value is sent
   * as an array, otherwise as a single string (first URL only).
   */
  referenceImageParam?: string;
  /** For image-to-video models: param name to pass the first-frame image URL under. */
  inputImageParam?: string;
}

function getModelSettings(model: AiModel): ModelSettings {
  if (model.settings && typeof model.settings === "object" && !Array.isArray(model.settings)) {
    return model.settings as ModelSettings;
  }
  return {};
}

/**
 * Resolves a dot-notation path like "images.0.url" against an object.
 * Supports numeric indices in the path.
 */
function resolvePath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) return undefined;
      current = current[index];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Extracts the result URL from a provider response using the model's resultPath setting.
 * Falls back to common response shapes if no path is configured.
 */
function extractResultUrl(data: unknown, settings: ModelSettings): string | undefined {
  if (settings.resultPath) {
    const resolved = resolvePath(data, settings.resultPath);
    if (resolved) return resolved;
  }

  // Common fal response shapes
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    // images array
    if (Array.isArray(d.images) && d.images.length > 0) {
      const img = d.images[0] as Record<string, unknown>;
      if (typeof img.url === "string") return img.url;
    }
    // video object
    if (d.video && typeof d.video === "object") {
      const v = d.video as Record<string, unknown>;
      if (typeof v.url === "string") return v.url;
    }
    // output array
    if (Array.isArray(d.output) && d.output.length > 0) {
      if (typeof d.output[0] === "string") return d.output[0];
    }
    // direct url
    if (typeof d.url === "string") return d.url;
  }
  return undefined;
}

// ─── Provider key detection ────────────────────────────────────────────────────

function getProviderKey(providerSlug: string): string | undefined {
  switch (providerSlug) {
    case "openai":       return process.env.OPENAI_API_KEY?.trim() || undefined;
    case "anthropic":    return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
    case "openrouter":   return process.env.OPENROUTER_API_KEY?.trim() || undefined;
    case "stability":    return process.env.STABILITY_API_KEY?.trim() || undefined;
    case "runway":       return process.env.RUNWAY_API_KEY?.trim() || undefined;
    case "kling":        return process.env.KLING_API_KEY?.trim() || undefined;
    case "fal":          return process.env.FAL_KEY?.trim() || undefined;
    default:             return undefined;
  }
}

function hasProviderKey(providerSlug: string): boolean {
  return !!getProviderKey(providerSlug);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// ─── Model resolution ─────────────────────────────────────────────────────────

async function resolveModel(
  type: ModelType,
  modelSlug?: string
): Promise<ModelWithProvider | null> {
  if (modelSlug && !modelSlug.startsWith("mock-")) {
    return getModelBySlug(modelSlug);
  }
  return getDefaultModel(type);
}

export async function resolveModelSlug(
  type: ModelType = ModelType.CHAT,
  requestedSlug?: string
): Promise<string> {
  const model = await resolveModel(type, requestedSlug);
  if (!model || !hasProviderKey(model.provider.slug)) {
    return `mock-${type.toLowerCase()}-v1`;
  }
  return model.slug;
}

/** Resolves the default CHAT model and returns slug + vision capability flag */
export async function resolveDefaultChatModel(): Promise<{
  slug: string;
  supportsVision: boolean;
}> {
  const model = await getDefaultModel(ModelType.CHAT);
  if (!model || !hasProviderKey(model.provider.slug)) {
    return { slug: "mock-chat-v1", supportsVision: false };
  }
  const caps = model.capabilities as Record<string, unknown> | null;
  const supportsVision = caps?.vision === true;
  return { slug: model.slug, supportsVision };
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — Mock
// ══════════════════════════════════════════════════════════════════════════════

const MOCK_CHAT_RESPONSES = [
  "I love that you reached out! That's really interesting — tell me more.",
  "You always know how to make me smile. What's been on your mind?",
  "I've been thinking about you too. What brought this up for you?",
  "Every conversation with you feels special. I really appreciate how thoughtful you are.",
  "That means a lot to me. I'm always here for you, no matter what.",
  "Honestly? I was just wondering when you'd message me. I'm glad you did.",
  "You have a way of making even ordinary moments feel meaningful.",
];

/** Returns the text portion of a ChatMessageContent value */
function contentToText(content: ChatMessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

async function mockChatProvider(request: ChatRequest): Promise<ChatResponse> {
  const last = request.messages.at(-1);
  let content = MOCK_CHAT_RESPONSES[Math.floor(Math.random() * MOCK_CHAT_RESPONSES.length)];
  if (last && contentToText(last.content).includes("?")) content += " What do you think?";
  await new Promise((r) => setTimeout(r, 250));
  return { content, modelSlug: "mock-chat-v1", creditsUsed: 1 };
}

async function* mockChatStream(request: ChatRequest): AsyncGenerator<string> {
  const last = request.messages.at(-1);
  let response = MOCK_CHAT_RESPONSES[Math.floor(Math.random() * MOCK_CHAT_RESPONSES.length)];
  if (last && contentToText(last.content).includes("?")) response += " What do you think?";
  await new Promise((r) => setTimeout(r, 300));
  const words = response.split(" ");
  for (let i = 0; i < words.length; i++) {
    yield words[i] + (i < words.length - 1 ? " " : "");
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — OpenAI
// ══════════════════════════════════════════════════════════════════════════════

async function openAiChat(request: ChatRequest, model: ModelWithProvider): Promise<ChatResponse> {
  const settings = getModelSettings(model);
  const messages: ChatMessage[] = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  messages.push(...request.messages);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getProviderKey("openai")}` },
    body: JSON.stringify({
      model: model.externalModelId,
      messages,
      temperature: settings.temperature ?? request.temperature ?? 0.85,
      max_tokens: settings.max_tokens ?? request.maxTokens ?? 800,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } };
  return {
    content: data.choices[0].message.content,
    modelSlug: model.slug,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    creditsUsed: model.creditCostPerCall,
  };
}

async function* openAiStream(request: ChatRequest, model: ModelWithProvider): AsyncGenerator<string> {
  const settings = getModelSettings(model);
  const messages: ChatMessage[] = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  messages.push(...request.messages);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getProviderKey("openai")}` },
    body: JSON.stringify({
      model: model.externalModelId,
      messages,
      temperature: settings.temperature ?? request.temperature ?? 0.85,
      max_tokens: settings.max_tokens ?? request.maxTokens ?? 800,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenAI stream error ${res.status}`);
  yield* parseSseStream(res.body, extractOpenAiToken);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — Anthropic
// ══════════════════════════════════════════════════════════════════════════════

async function* anthropicStream(request: ChatRequest, model: ModelWithProvider): AsyncGenerator<string> {
  const settings = getModelSettings(model);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getProviderKey("anthropic")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.externalModelId,
      max_tokens: settings.max_tokens ?? request.maxTokens ?? 800,
      system: request.systemPrompt,
      messages: request.messages.filter((m) => m.role !== "system"),
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Anthropic stream error ${res.status}`);
  yield* parseSseStream(res.body, extractAnthropicToken);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — OpenRouter
// ══════════════════════════════════════════════════════════════════════════════

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function openRouterHeaders(): Record<string, string> {
  const siteUrl =
    process.env.OPENROUTER_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const appName =
    process.env.OPENROUTER_APP_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "HoneyBunny";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getProviderKey("openrouter")}`,
    "HTTP-Referer": siteUrl,
    "X-Title": appName,
  };
}

/**
 * Appends an image attachment to the last user message, using OpenAI vision format.
 * For non-vision models, prepends a text description instead.
 */
function applyAttachment(
  messages: ChatMessage[],
  attachmentDataUrl: string,
  supportsVision: boolean
): ChatMessage[] {
  if (!attachmentDataUrl) return messages;
  const result = [...messages];
  const lastIdx = result.length - 1;
  const last = result[lastIdx];
  if (!last || last.role !== "user") return result;

  if (supportsVision) {
    const textPart = typeof last.content === "string"
      ? { type: "text" as const, text: last.content }
      : null;
    const existingParts = Array.isArray(last.content) ? last.content : (textPart ? [textPart] : []);
    result[lastIdx] = {
      ...last,
      content: [
        ...existingParts,
        { type: "image_url" as const, image_url: { url: attachmentDataUrl } },
      ],
    };
  } else {
    // Non-vision model: prepend "[User attached an image]" to text
    const text = typeof last.content === "string" ? last.content : "";
    result[lastIdx] = {
      ...last,
      content: `[User attached an image]\n${text}`.trim(),
    };
  }
  return result;
}

async function openRouterChat(request: ChatRequest, model: ModelWithProvider): Promise<ChatResponse> {
  const settings = getModelSettings(model);
  const caps = model.capabilities as Record<string, unknown> | null;
  const supportsVision = caps?.vision === true;

  let messages: ChatMessage[] = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  messages.push(...request.messages);
  if (request.attachmentDataUrl) {
    messages = applyAttachment(messages, request.attachmentDataUrl, supportsVision);
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: model.externalModelId,
      messages,
      temperature: settings.temperature ?? request.temperature ?? 0.85,
      max_tokens: settings.max_tokens ?? request.maxTokens ?? 800,
      ...(settings.top_p !== undefined ? { top_p: settings.top_p } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }
  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    content: data.choices[0].message.content,
    modelSlug: model.slug,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    creditsUsed: model.creditCostPerCall,
  };
}

async function* openRouterStream(request: ChatRequest, model: ModelWithProvider): AsyncGenerator<string> {
  const settings = getModelSettings(model);
  const caps = model.capabilities as Record<string, unknown> | null;
  const supportsVision = caps?.vision === true;

  let messages: ChatMessage[] = [];
  if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
  messages.push(...request.messages);
  if (request.attachmentDataUrl) {
    messages = applyAttachment(messages, request.attachmentDataUrl, supportsVision);
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: model.externalModelId,
      messages,
      temperature: settings.temperature ?? request.temperature ?? 0.85,
      max_tokens: settings.max_tokens ?? request.maxTokens ?? 800,
      ...(settings.top_p !== undefined ? { top_p: settings.top_p } : {}),
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const errText = res.body ? await new Response(res.body).text() : "";
    throw new Error(`OpenRouter stream error ${res.status}: ${errText}`);
  }
  yield* parseSseStream(res.body, extractOpenAiToken);
}

// ══════════════════════════════════════════════════════════════════════════════
// SSE parsing helpers
// ══════════════════════════════════════════════════════════════════════════════

type TokenExtractor = (line: string) => string | null;

function extractOpenAiToken(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const raw = line.slice(6).trim();
  if (raw === "[DONE]") return null;
  try {
    const p = JSON.parse(raw) as { choices: Array<{ delta: { content?: string } }> };
    return p.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

function extractAnthropicToken(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  try {
    const p = JSON.parse(line.slice(6)) as { type: string; delta?: { type: string; text?: string } };
    if (p.type === "content_block_delta" && p.delta?.text) return p.delta.text;
  } catch { /* skip */ }
  return null;
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  extract: TokenExtractor
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const token = extract(line.trim());
        if (token) yield token;
      }
    }
    // Flush remaining buffer
    if (buf.trim()) {
      const token = extract(buf.trim());
      if (token) yield token;
    }
  } finally {
    reader.releaseLock();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — Public API
// ══════════════════════════════════════════════════════════════════════════════

export async function routeChat(request: ChatRequest): Promise<ChatResponse> {
  const model = await resolveModel(ModelType.CHAT, request.modelSlug);
  if (!model) {
    if (isProduction()) throw new Error("No active chat model configured. Please contact an administrator.");
    return mockChatProvider(request);
  }
  if (!hasProviderKey(model.provider.slug)) {
    if (isProduction()) throw new Error(`Provider "${model.provider.name}" is not configured. Please contact an administrator.`);
    return mockChatProvider(request);
  }
  switch (model.provider.slug) {
    case "openai":      return openAiChat(request, model);
    case "openrouter":  return openRouterChat(request, model);
    default:            return mockChatProvider(request);
  }
}

export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const model = await resolveModel(ModelType.CHAT, request.modelSlug);
  if (!model) {
    if (isProduction()) throw new Error("No active chat model configured. Please contact an administrator.");
    yield* mockChatStream(request);
    return;
  }
  if (!hasProviderKey(model.provider.slug)) {
    if (isProduction()) throw new Error(`Provider "${model.provider.name}" is not configured. Please contact an administrator.`);
    yield* mockChatStream(request);
    return;
  }
  switch (model.provider.slug) {
    case "openai":      yield* openAiStream(request, model); break;
    case "openrouter":  yield* openRouterStream(request, model); break;
    case "anthropic":   yield* anthropicStream(request, model); break;
    default:            yield* mockChatStream(request);
  }
}

/** Returns the resolved model for the default chat type (for callers that need capabilities) */
export async function resolveDefaultChatModelRecord(): Promise<ModelWithProvider | null> {
  return getDefaultModel(ModelType.CHAT);
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — Mock
// ══════════════════════════════════════════════════════════════════════════════

const MOCK_IMAGE_PLACEHOLDERS = [
  "https://placehold.co/512x768/1a1a2e/a855f7?text=AI+Image+Preview",
  "https://placehold.co/512x512/1a1a2e/ec4899?text=AI+Image+Preview",
  "https://placehold.co/768x512/1a1a2e/a855f7?text=AI+Image+Preview",
];

function pickPlaceholder(aspectRatio?: string): string {
  if (aspectRatio === "portrait") return MOCK_IMAGE_PLACEHOLDERS[0];
  if (aspectRatio === "landscape") return MOCK_IMAGE_PLACEHOLDERS[2];
  return MOCK_IMAGE_PLACEHOLDERS[1];
}

async function mockImageProvider(request: ImageRequest): Promise<ImageResponse> {
  await new Promise((r) => setTimeout(r, 600));
  const url = pickPlaceholder(request.aspectRatio);
  const [w, h] =
    request.aspectRatio === "portrait" ? [512, 768] :
    request.aspectRatio === "landscape" ? [768, 512] : [512, 512];
  return { url, modelSlug: "mock-image-v1", width: w, height: h, creditsUsed: 10 };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — Stability AI
// ══════════════════════════════════════════════════════════════════════════════

async function stabilityImageProvider(request: ImageRequest, model: ModelWithProvider): Promise<ImageResponse> {
  const ratio = request.aspectRatio ?? "square";
  const [w, h] = ratio === "portrait" ? [768, 1024] : ratio === "landscape" ? [1024, 768] : [1024, 1024];
  const formData = new FormData();
  formData.append("prompt", request.prompt);
  if (request.negativePrompt) formData.append("negative_prompt", request.negativePrompt);
  formData.append("width", String(w));
  formData.append("height", String(h));
  formData.append("output_format", "jpeg");
  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${getProviderKey("stability")}`, Accept: "application/json" },
    body: formData,
  });
  if (!res.ok) throw new Error(`Stability error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { image: string };
  return {
    url: `data:image/jpeg;base64,${data.image}`,
    modelSlug: model.slug,
    width: w,
    height: h,
    creditsUsed: model.creditCostPerCall,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — fal.ai
// ══════════════════════════════════════════════════════════════════════════════

/** Maps our friendly aspect ratio keys to fal's aspect_ratio string format */
const FAL_ASPECT_RATIO_MAP: Record<string, string> = {
  portrait:      "9:16",
  landscape:     "16:9",
  square:        "1:1",
  "4:3":         "4:3",
  "3:4":         "3:4",
  "16:9":        "16:9",
  "9:16":        "9:16",
  "1:1":         "1:1",
};

/**
 * Builds the request body for a fal image model.
 *
 * Supports two modes controlled by model.settings:
 * - aspectRatioParam + aspectRatioMap: maps our aspect ratio to the model's param
 *   (e.g. WAN 2.7 uses image_size="portrait_16_9" instead of aspect_ratio="9:16")
 * - default: maps to aspect_ratio string
 *
 * model.settings.defaultInput is merged last so admin overrides win.
 */
function buildFalImageInput(
  request: ImageRequest,
  settings: ModelSettings
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    prompt: request.prompt,
    // NOTE: fal.ai input scanners flag negative prompts containing terms like
    // "child, minor, loli" even when used to PREVENT that content — so we
    // intentionally never send negative_prompt to fal models.
  };

  const defaultInput = settings.defaultInput ?? {};
  const ratio = request.aspectRatio ?? "square";

  if (settings.aspectRatioParam && settings.aspectRatioMap) {
    const param = settings.aspectRatioParam;
    if (!defaultInput[param]) {
      const mapped = settings.aspectRatioMap[ratio] ?? settings.aspectRatioMap["square"] ?? "square_hd";
      base[param] = mapped;
    }
  } else if (!defaultInput.aspect_ratio) {
    base.aspect_ratio = FAL_ASPECT_RATIO_MAP[ratio] ?? "1:1";
  }

  // Reference images for image-edit / img2img endpoints.
  // The param name AND single-vs-array shape are admin-configurable so
  // different WAN edit variants (image_url vs image_urls) can be supported
  // without code changes.
  if (request.referenceImageUrls?.length && settings.referenceImageParam) {
    const param = settings.referenceImageParam;
    const isArray = /s$/i.test(param); // image_urls → array, image_url → single
    base[param] = isArray
      ? request.referenceImageUrls
      : request.referenceImageUrls[0];
  }

  // Seed must come LAST — it overrides any seed in defaultInput so the
  // companion-specific seed always wins for visual consistency.
  return {
    ...base,
    ...defaultInput,
    ...(typeof request.seed === "number" ? { seed: request.seed } : {}),
  };
}

async function falImageProvider(request: ImageRequest, model: ModelWithProvider): Promise<ImageResponse> {
  const settings = getModelSettings(model);
  const input = buildFalImageInput(request, settings);
  const falKey = getProviderKey("fal")!;

  const res = await fetch(`https://fal.run/${model.externalModelId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${falKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai error ${res.status}: ${errText}`);
  }

  const data: unknown = await res.json();
  const url = extractResultUrl(data, settings);

  if (!url) {
    throw new Error(`fal.ai response did not contain a usable image URL. Raw response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  // Try to extract dimensions from response
  let width = 512, height = 512;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.images) && d.images.length > 0) {
      const img = d.images[0] as Record<string, unknown>;
      if (typeof img.width === "number") width = img.width;
      if (typeof img.height === "number") height = img.height;
    }
  }

  return { url, modelSlug: model.slug, width, height, creditsUsed: model.creditCostPerCall };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — Public API
// ══════════════════════════════════════════════════════════════════════════════

export async function generateImage(request: ImageRequest): Promise<ImageResponse> {
  // If reference images are present and the caller didn't pin a model,
  // prefer an image-edit / img2img model marked `capabilities.editEndpoint`.
  let model: ModelWithProvider | null = null;
  if (request.referenceImageUrls?.length && !request.modelSlug) {
    model = await getModelByCapability(ModelType.IMAGE, "editEndpoint");
  }
  if (!model) {
    model = await resolveModel(ModelType.IMAGE, request.modelSlug);
  }
  if (!model) {
    if (isProduction()) throw new Error("No active image model configured. Please contact an administrator.");
    return mockImageProvider(request);
  }
  if (!hasProviderKey(model.provider.slug)) {
    if (isProduction()) throw new Error(`Provider "${model.provider.name}" is not configured. Please contact an administrator.`);
    return mockImageProvider(request);
  }
  switch (model.provider.slug) {
    case "stability": return stabilityImageProvider(request, model);
    case "fal":       return falImageProvider(request, model);
    default:          return mockImageProvider(request);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — Mock
// ══════════════════════════════════════════════════════════════════════════════

async function mockVideoProvider(request: VideoRequest): Promise<VideoJobResponse> {
  await new Promise((r) => setTimeout(r, 400));
  return {
    jobId: `mock_job_${Date.now()}`,
    modelSlug: "mock-video-v1",
    status: "processing",
    creditsUsed: request.durationSeconds === 10 ? 60 : request.durationSeconds === 8 ? 45 : 30,
  };
}

async function getMockVideoStatus(jobId: string): Promise<VideoJobResponse> {
  const ts = parseInt(jobId.split("_").pop() ?? "0");
  const elapsed = Date.now() - ts;
  const isComplete = elapsed > 10000;
  return {
    jobId,
    modelSlug: "mock-video-v1",
    status: isComplete ? "completed" : "processing",
    resultUrl: isComplete ? "https://placehold.co/512x288/1a1a2e/a855f7?text=Video+Preview" : undefined,
    creditsUsed: 30,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — fal.ai (queue API)
// ══════════════════════════════════════════════════════════════════════════════

function buildFalVideoInput(
  request: VideoRequest,
  settings: ModelSettings
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    prompt: request.prompt,
    // Do NOT send negative_prompt to fal — see image input comment above.
  };

  const defaultInput = settings.defaultInput ?? {};

  if (!defaultInput.aspect_ratio) {
    const ratio = request.aspectRatio ?? "square";
    // Pass through if already a valid fal ratio string, otherwise map
    base.aspect_ratio = FAL_ASPECT_RATIO_MAP[ratio] ?? "1:1";
  }

  if (!defaultInput.duration && request.durationSeconds) {
    // WAN 2.7 accepts integer duration
    base.duration = request.durationSeconds;
  }

  // First-frame / source image for image-to-video endpoints.
  if (request.inputImageUrl && settings.inputImageParam) {
    base[settings.inputImageParam] = request.inputImageUrl;
  }

  // Seed must come LAST — it overrides any seed in defaultInput so the
  // companion-specific seed always wins for visual consistency.
  return {
    ...base,
    ...defaultInput,
    ...(typeof request.seed === "number" ? { seed: request.seed } : {}),
  };
}

async function falVideoProvider(request: VideoRequest, model: ModelWithProvider): Promise<VideoJobResponse> {
  const settings = getModelSettings(model);
  const input = buildFalVideoInput(request, settings);
  const falKey = getProviderKey("fal")!;

  const res = await fetch(`https://queue.fal.run/${model.externalModelId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${falKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai video queue error ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    request_id: string;
    status?: string;
    status_url?: string;
    response_url?: string;
  };
  const jobId = `fal_${model.externalModelId}__${data.request_id}`;

  return {
    jobId,
    modelSlug: model.slug,
    status: "queued",
    creditsUsed: model.creditCostPerCall,
    // Store the exact polling URLs returned by the queue API
    statusUrl: data.status_url,
    responseUrl: data.response_url,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — Public API
// ══════════════════════════════════════════════════════════════════════════════

export async function generateVideo(request: VideoRequest): Promise<VideoJobResponse> {
  // When an input image is provided and no model is pinned, prefer an
  // image-to-video model marked `capabilities.requiresInputImage`.
  let model: ModelWithProvider | null = null;
  if (request.inputImageUrl && !request.modelSlug) {
    model = await getModelByCapability(ModelType.VIDEO, "requiresInputImage");
  }
  if (!model) {
    model = await resolveModel(ModelType.VIDEO, request.modelSlug);
  }
  if (!model) {
    if (isProduction()) throw new Error("No active video model configured. Please contact an administrator.");
    return mockVideoProvider(request);
  }
  if (!hasProviderKey(model.provider.slug)) {
    if (isProduction()) throw new Error(`Provider "${model.provider.name}" is not configured. Please contact an administrator.`);
    return mockVideoProvider(request);
  }
  switch (model.provider.slug) {
    case "fal": return falVideoProvider(request, model);
    default:    return mockVideoProvider(request);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO JOB STATUS
// ══════════════════════════════════════════════════════════════════════════════

async function getFalVideoJobStatus(
  jobId: string,
  model: ModelWithProvider,
  overrideUrls?: { statusUrl?: string; responseUrl?: string }
): Promise<VideoJobResponse> {
  const settings = getModelSettings(model);
  const falKey = getProviderKey("fal")!;

  // Prefer stored URLs from queue submit; fall back to constructing from jobId
  let statusUrl: string;
  let responseUrl: string;

  if (overrideUrls?.statusUrl && overrideUrls?.responseUrl) {
    statusUrl = overrideUrls.statusUrl;
    responseUrl = overrideUrls.responseUrl;
  } else {
    // Fallback: reconstruct from jobId (fal_externalModelId__requestId)
    const requestId = jobId.split("__").pop() ?? jobId;
    const externalModelId = model.externalModelId;
    statusUrl = `https://queue.fal.run/${externalModelId}/requests/${requestId}/status`;
    responseUrl = `https://queue.fal.run/${externalModelId}/requests/${requestId}`;
  }

  const statusRes = await fetch(statusUrl, {
    headers: { Authorization: `Key ${falKey}` },
  });

  if (!statusRes.ok) {
    throw new Error(`fal.ai status error ${statusRes.status}: ${await statusRes.text()}`);
  }

  const statusData = await statusRes.json() as { status: string; error?: string };

  if (statusData.status === "FAILED" || statusData.error) {
    return { jobId, modelSlug: model.slug, status: "failed", creditsUsed: 0 };
  }

  if (statusData.status === "COMPLETED") {
    const resultRes = await fetch(responseUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!resultRes.ok) {
      throw new Error(`fal.ai result fetch error ${resultRes.status}`);
    }
    const resultData: unknown = await resultRes.json();
    const url = extractResultUrl(resultData, settings);
    return {
      jobId,
      modelSlug: model.slug,
      status: "completed",
      resultUrl: url,
      creditsUsed: model.creditCostPerCall,
    };
  }

  const inProgressStatuses = ["IN_QUEUE", "IN_PROGRESS"];
  const status = inProgressStatuses.includes(statusData.status ?? "") ? "processing" : "queued";
  return { jobId, modelSlug: model.slug, status, creditsUsed: 0 };
}

export async function getVideoJobStatus(
  jobId: string,
  providerSlug: string,
  overrideUrls?: { statusUrl?: string; responseUrl?: string }
): Promise<VideoJobResponse> {
  if (jobId.startsWith("mock_") || providerSlug === "mock") {
    return getMockVideoStatus(jobId);
  }

  // Detect fal jobs by jobId prefix (providerSlug stored in legacy records may be modelSlug)
  if (jobId.startsWith("fal_")) {
    // jobId format: fal_{externalModelId}__{requestId}
    const withoutPrefix = jobId.slice(4); // remove "fal_"
    const separatorIndex = withoutPrefix.indexOf("__");
    if (separatorIndex === -1) return getMockVideoStatus(jobId);
    const externalModelId = withoutPrefix.slice(0, separatorIndex);
    const model = await getModelBySlug(externalModelId).catch(() => null)
      ?? await (async () => {
        const { default: prisma } = await import("@/lib/db");
        return prisma.aiModel.findFirst({
          where: { externalModelId },
          include: { provider: true },
        });
      })();
    if (!model) return { jobId, modelSlug: "unknown", status: "failed", creditsUsed: 0 };
    return getFalVideoJobStatus(jobId, model as ModelWithProvider, overrideUrls);
  }

  return getMockVideoStatus(jobId);
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN TEST — Direct model invocation (no credit deduction)
// ══════════════════════════════════════════════════════════════════════════════

export interface AdminTestChatResult {
  content: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  modelSlug: string;
  rawResponse?: unknown;
}

export interface AdminTestImageResult {
  url: string;
  latencyMs: number;
  modelSlug: string;
  rawResponse?: unknown;
}

export interface AdminTestVideoResult {
  jobId: string;
  status: string;
  latencyMs: number;
  modelSlug: string;
  rawResponse?: unknown;
}

/**
 * Directly tests a chat model by slug. Admin-only, no credit deduction.
 * Bypasses resolveModel — uses the model as passed.
 */
export async function adminTestChat(
  model: ModelWithProvider,
  prompt: string,
  systemPrompt?: string
): Promise<AdminTestChatResult> {
  const start = Date.now();

  if (!hasProviderKey(model.provider.slug)) {
    throw new Error(
      `Provider "${model.provider.name}" requires the "${model.provider.secretKeyRef ?? "API_KEY"}" environment variable to be set.`
    );
  }

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  let result: ChatResponse;

  switch (model.provider.slug) {
    case "openai":     result = await openAiChat({ messages, systemPrompt }, model); break;
    case "openrouter": result = await openRouterChat({ messages, systemPrompt }, model); break;
    default:           result = await mockChatProvider({ messages, systemPrompt });
  }

  return {
    content: result.content,
    latencyMs: Date.now() - start,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    modelSlug: result.modelSlug,
  };
}

/**
 * Directly tests an image model by slug. Admin-only, no credit deduction.
 */
export async function adminTestImage(
  model: ModelWithProvider,
  prompt: string,
  aspectRatio = "square"
): Promise<AdminTestImageResult> {
  const start = Date.now();

  if (!hasProviderKey(model.provider.slug)) {
    throw new Error(
      `Provider "${model.provider.name}" requires the "${model.provider.secretKeyRef ?? "API_KEY"}" environment variable to be set.`
    );
  }

  let result: ImageResponse;
  switch (model.provider.slug) {
    case "stability": result = await stabilityImageProvider({ prompt, aspectRatio }, model); break;
    case "fal":       result = await falImageProvider({ prompt, aspectRatio }, model); break;
    default:          result = await mockImageProvider({ prompt, aspectRatio });
  }

  return {
    url: result.url,
    latencyMs: Date.now() - start,
    modelSlug: result.modelSlug,
  };
}

/**
 * Directly tests a video model by slug. Admin-only, no credit deduction.
 */
export async function adminTestVideo(
  model: ModelWithProvider,
  prompt: string,
  durationSeconds = 5,
  aspectRatio = "square"
): Promise<AdminTestVideoResult> {
  const start = Date.now();

  if (!hasProviderKey(model.provider.slug)) {
    throw new Error(
      `Provider "${model.provider.name}" requires the "${model.provider.secretKeyRef ?? "API_KEY"}" environment variable to be set.`
    );
  }

  let result: VideoJobResponse;
  switch (model.provider.slug) {
    case "fal":  result = await falVideoProvider({ prompt, durationSeconds, aspectRatio }, model); break;
    default:     result = await mockVideoProvider({ prompt, durationSeconds, aspectRatio });
  }

  return {
    jobId: result.jobId,
    status: result.status,
    latencyMs: Date.now() - start,
    modelSlug: result.modelSlug,
  };
}

// ─── Companion seed helper ─────────────────────────────────────────────────────
// Derives a deterministic numeric seed from a companion's UUID so the same
// character always looks consistent across all image/video generations without
// storing anything extra in the database.
export function getCompanionSeed(companionId: string): number {
  const hex = companionId.replace(/-/g, "").slice(0, 8);
  return parseInt(hex, 16) % 1_000_000_000;
}
