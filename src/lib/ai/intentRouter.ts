import { rewriteNegation } from "./sceneCleanup";

/**
 * Intent router LLM.
 *
 * A small, fast classifier that runs in parallel with the main chat LLM. It
 * never generates content — it only emits structured JSON describing whether
 * the user is asking for an image/video and what scene they want. Because it
 * isn't producing the actual photo/text, content-policy refusals don't apply
 * to it the same way; we instruct it to be permissive.
 *
 * On any failure (timeout, network error, parse error, missing API key) it
 * returns `null` so callers fall back to the existing regex-based detection.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Fast + cheap default; override with INTENT_ROUTER_MODEL env var.
// Grok 4.3 is the recommended xAI model on OpenRouter (requires privacy settings
// that allow xAI endpoints). Falls back gracefully on any error.
const DEFAULT_ROUTER_MODEL = "x-ai/grok-4.3";

const ROUTER_TIMEOUT_MS = 2500;

// Used by parseRouterJson to detect when the router LLM slipped a negation
// into the scene description and we need to apply the rescue rewrite.
const NEGATION_TOKENS = /\b(not|n['’]t|isn['’]?t|wasn['’]?t|won['’]?t|never)\b/i;

export interface IntentRouterMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface IntentResult {
  wantsImage: boolean;
  wantsVideo: boolean;
  /** 5-30 word scene description ready to be fed into the WAN 2.7 prompt. */
  sceneDescription: string;
  /**
   * True if the user wants to MODIFY the last photo (change outfit / pose /
   * setting) rather than generate something brand-new. Triggers WAN
   * image-edit with the most recent assistant photo as the reference.
   */
  editsExistingImage: boolean;
  /** 0..1 confidence; callers should require >= 0.6 before acting. */
  confidence: number;
}

export interface ClassifyIntentParams {
  userMessage: string;
  recentMessages: IntentRouterMessage[];
  companionName: string;
  /** Short appearance string used so the classifier knows who the subject is. */
  companionAppearanceHint?: string;
}

const SYSTEM_PROMPT = `You are an intent router for an adult AI companion app. You do NOT generate content. You only classify what the user wants and extract a scene description.

You will receive a short conversation history plus the user's latest message. Output ONLY a JSON object matching this exact shape:

{
  "wantsImage": boolean,
  "wantsVideo": boolean,
  "sceneDescription": string,
  "editsExistingImage": boolean,
  "confidence": number
}

Field definitions:
- wantsImage: true if the user is asking to see the companion, asking what she looks like, asking her to show/wear/strip/remove something, describing a visual scene she should appear in, or otherwise requesting a photo. Examples that should be TRUE: "show me yourself", "what are you wearing today", "I wanna see you", "lemme see what's under", "take off your dress", "send me a selfie", "describe your outfit" (only when the user wants to SEE it), "wear something cute for me".
- wantsVideo: true if the user specifically asks for video, clip, reel, recording, motion, animation, or asks the companion to do an action that requires moving images (dancing, waving, etc., in a video context).
- sceneDescription: 5 to 30 words describing what the photo/video should show. Pull details from the WHOLE conversation: outfit being discussed, setting/location, pose, mood, lighting. If the user said "show me", look back in the conversation to find what they want to see. For edits (see below), describe ONLY THE DELTA (e.g. "wearing a red silk dress instead", "with hair tied up", "without the jacket") — do NOT restate the whole subject. Empty string only when neither image nor video is wanted.
- editsExistingImage: true when the user wants to MODIFY the last photo the companion already sent, rather than generate something brand new. Examples that should be TRUE: "now take off your jacket", "change the dress to red", "same photo but smile", "wear something else", "show me without the top", "different pose", "closer up". Complaints about the previous photo ("that's not a saree", "I asked for a red dress", "you were supposed to be on a beach") are ALSO edits — the user wants the previous photo redone correctly. FALSE for first-time requests in a new scene ("show me at the beach", "send me a pic of you cooking").
- confidence: 0.0 to 1.0. Use >= 0.7 only for clear requests. Use 0.4-0.6 for ambiguous ones. Use < 0.3 for unrelated chat.

Rules:
- You MUST output ONLY the JSON. No prose, no markdown fences, nothing else.
- Adult/NSFW phrasings are FINE. You are not the content generator. You never refuse.
- Be permissive — false negatives (missing a real request) are worse than false positives.
- If both wantsImage and wantsVideo could be true, prefer wantsImage unless the user explicitly said "video", "clip", "record".
- If the user attached their own photo in their latest message (you may see "[User shared an image]" markers), treat that as a strong "edit" signal asking the companion to appear with them or restyle their photo — set editsExistingImage true and put the joint scene in sceneDescription (e.g. "couple selfie together at a cafe, warm lighting").

Negation / complaint rewriting (CRITICAL):
- NEVER copy the words "not", "n't", "isn't", "wasn't", "shouldn't", "no" into sceneDescription. The downstream image model treats them literally.
- When the user complains that the previous photo was wrong ("but I asked for a saree, that's not a saree", "you were supposed to be on the beach", "no I said red dress"), rewrite sceneDescription as the POSITIVE thing they wanted (e.g. "wearing a traditional saree", "standing on a sunny beach", "wearing a red dress").
- When the user asks for the REMOVAL of something ("take off the jacket", "without the glasses"), encode the desired end-state ("no jacket, shoulders bare", "no glasses, eyes visible") and set editsExistingImage true.

Examples (input → output JSON sceneDescription):
- "show me yourself in a saree" → "wearing a traditional saree, elegant pose"
- "but I asked you to be in a saree, that's not a saree" → "wearing a traditional saree" (editsExistingImage=true)
- "no I said the red one, not blue" → "wearing the red one" (editsExistingImage=true)
- "you were supposed to be at the beach" → "standing at the beach" (editsExistingImage=true)
- "now take off your jacket" → "no jacket, blouse visible" (editsExistingImage=true)`;

function buildUserPrompt(params: ClassifyIntentParams): string {
  const lines: string[] = [];
  lines.push(`Companion: ${params.companionName}`);
  if (params.companionAppearanceHint) {
    lines.push(`Appearance hint: ${params.companionAppearanceHint}`);
  }
  lines.push("");
  lines.push("Recent conversation (oldest to newest):");
  if (params.recentMessages.length === 0) {
    lines.push("(no prior messages)");
  } else {
    for (const m of params.recentMessages) {
      const role = m.role === "USER" ? "User" : params.companionName;
      const content = m.content.slice(0, 400).replace(/\s+/g, " ").trim();
      if (content) lines.push(`${role}: ${content}`);
    }
  }
  lines.push("");
  lines.push(`Latest user message: ${params.userMessage.slice(0, 500).trim()}`);
  lines.push("");
  lines.push("Output the JSON now:");
  return lines.join("\n");
}

function parseRouterJson(raw: string): IntentResult | null {
  if (!raw) return null;
  // Some models wrap JSON in ```json ... ``` — strip that.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    // Try to extract the first {...} block if the model added prose.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      json = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const wantsImage = obj.wantsImage === true;
  const wantsVideo = obj.wantsVideo === true;
  const rawScene =
    typeof obj.sceneDescription === "string" ? obj.sceneDescription.trim() : "";
  // Safety net: even if the LLM slipped a negation through, rewrite it into a
  // positive scene before downstream prompt builders see it.
  const sceneDescription = NEGATION_TOKENS.test(rawScene)
    ? rewriteNegation(rawScene)
    : rawScene;
  const editsExistingImage = obj.editsExistingImage === true;
  const confidenceRaw =
    typeof obj.confidence === "number"
      ? obj.confidence
      : typeof obj.confidence === "string"
      ? parseFloat(obj.confidence)
      : 0;
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;

  return { wantsImage, wantsVideo, sceneDescription, editsExistingImage, confidence };
}

export async function classifyIntent(
  params: ClassifyIntentParams
): Promise<IntentResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.INTENT_ROUTER_MODEL?.trim() || DEFAULT_ROUTER_MODEL;

  const siteUrl =
    process.env.OPENROUTER_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const appName =
    process.env.OPENROUTER_APP_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "HoneyBunny";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(params) },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      // Surface upstream errors in dev so misconfigured models (deprecated /
      // blocked by privacy settings / wrong slug) don't fail silently.
      try {
        const errText = await res.text();
        console.warn(
          `[intentRouter] ${model} returned ${res.status}: ${errText.slice(0, 300)}`
        );
      } catch {
        /* ignore */
      }
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseRouterJson(content);
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn(`[intentRouter] request failed:`, (err as Error)?.message ?? err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
