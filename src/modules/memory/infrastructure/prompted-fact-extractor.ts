import "server-only";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type { FactExtractor } from "../application/ports/fact-extractor";
import type { MemoryFactDraft } from "../domain/fact";
import type { MemoryCategory } from "@prisma/client";

const SYSTEM_PROMPT = `You extract durable facts about the USER from a single conversational exchange.

Return ONLY JSON with this exact shape:
{
  "facts": [
    {
      "content": "single sentence, always in third person referring to 'the user'",
      "category": "IDENTITY" | "PREFERENCE" | "RELATIONSHIP" | "EVENT" | "PLAN" | "EMOTION" | "OPINION" | "COMMITMENT" | "OTHER",
      "entities": ["proper nouns from the fact"],
      "valence": -1..1,
      "confidence": 0..1,
      "metadata": { "key"?: "name"|"birthday"|"job"|"city"|"pronouns", "value"?: "..." }
    }
  ]
}

Rules:
- Include AT MOST 4 facts. Skip trivial pleasantries.
- IDENTITY facts (name, birthday, job, city, pronouns) MUST include metadata.key + metadata.value so we can pin them to the user profile.
- Do NOT extract facts about the AI companion — only the user.
- If nothing is durable, return {"facts": []}.`;

const MAX_FACTS = 4;
const VALID_CATEGORIES: readonly MemoryCategory[] = [
  "IDENTITY",
  "PREFERENCE",
  "RELATIONSHIP",
  "EVENT",
  "PLAN",
  "EMOTION",
  "OPINION",
  "COMMITMENT",
  "OTHER",
];

/**
 * PromptedFactExtractor — thin wrapper around the LLM. Resolves the
 * EXTRACTOR model from ModelConfig on every call so admin edits propagate
 * within the cache TTL.
 */
export class PromptedFactExtractor implements FactExtractor {
  constructor(
    private readonly llm: ChatLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async extract(input: {
    characterName: string;
    userMessage: string;
    assistantMessage: string;
  }): Promise<MemoryFactDraft[]> {
    const model = await this.models.resolve("EXTRACTOR");

    const userPayload = [
      `Companion: ${input.characterName}`,
      `USER: ${input.userMessage}`,
      `ASSISTANT: ${input.assistantMessage}`,
    ].join("\n");

    const result = await this.llm.generateJson({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    });

    return parseFacts(result.content);
  }
}

function parseFacts(raw: string): MemoryFactDraft[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const facts = (parsed as { facts?: unknown })?.facts;
  if (!Array.isArray(facts)) return [];

  const out: MemoryFactDraft[] = [];
  for (const raw of facts) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const content =
      typeof rec["content"] === "string" ? rec["content"].trim() : "";
    if (content.length === 0) continue;
    const category = normalizeCategory(rec["category"]);
    if (!category) continue;
    const entities = Array.isArray(rec["entities"])
      ? rec["entities"].filter((e): e is string => typeof e === "string")
      : [];
    const valence = clampNumber(rec["valence"], -1, 1, 0);
    const confidence = clampNumber(rec["confidence"], 0, 1, 0.6);
    const metadata =
      rec["metadata"] && typeof rec["metadata"] === "object"
        ? (rec["metadata"] as Record<string, unknown>)
        : undefined;
    out.push({ content, category, entities, valence, confidence, metadata });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

function normalizeCategory(v: unknown): MemoryCategory | null {
  if (typeof v !== "string") return null;
  const upper = v.trim().toUpperCase();
  return (VALID_CATEGORIES as readonly string[]).includes(upper)
    ? (upper as MemoryCategory)
    : null;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}
