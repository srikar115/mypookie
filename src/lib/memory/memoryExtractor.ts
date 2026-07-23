/**
 * Automatic companion memory extractor.
 *
 * Periodically reviews the recent conversation transcript and proposes
 * additions / updates / invariants for the per-companion memory markdown.
 * Runs in the background after each user-visible reply — failures are
 * swallowed so chat is never blocked.
 *
 * Output contract from the extractor LLM:
 *   {
 *     "additions":  string[],  // brand-new facts to remember
 *     "updates":    string[],  // corrections / refinements of existing facts
 *     "invariants": string[]   // user preferences / boundaries / promises
 *   }
 *
 * The merge step folds these into the existing markdown under stable section
 * headings. Existing markdown is never lost — version history captures the
 * previous version via `updateMemory`.
 */

import prisma from "@/lib/db";
import { updateMemory, getMemory } from "./memoryService";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_EXTRACTOR_MODEL = "google/gemini-2.5-flash-lite";
const EXTRACTOR_TIMEOUT_MS = 10_000;

/** Trigger extraction every N user messages. */
export const EXTRACT_EVERY_N_USER_MESSAGES = 10;

/** Recent transcript window we feed to the extractor each run. */
const RECENT_MESSAGES_WINDOW = 20;

interface ExtractorParams {
  conversationId: string;
  companionId: string;
  userId: string;
}

interface ExtractorOutput {
  additions: string[];
  updates: string[];
  invariants: string[];
}

const SYSTEM_PROMPT = `You are a memory extractor for an AI companion app.

You will see the existing memory markdown (may be sparse) and the most recent N messages between the user and the companion. Your job is to propose updates to the memory.

Output ONLY a strict JSON object matching:
{
  "additions":  string[],  // brand-new facts about the user worth remembering
  "updates":    string[],  // corrections to or refinements of existing facts
  "invariants": string[]   // preferences, boundaries, or promises that should never be forgotten
}

Guidelines:
- Each array item is a SINGLE short sentence (< 25 words).
- Cover: name, age range, location, occupation, relationship status, hobbies, communication style preferences, kinks/likes/limits explicitly stated, important life events shared, things the user explicitly asked the companion to remember.
- IGNORE small talk and ephemeral mood ("she had a long day").
- IGNORE anything fictional the companion described about herself — only USER-related facts.
- Return empty arrays if nothing notable is in the recent window.
- DO NOT output prose, markdown, or code fences. ONLY the JSON object.`;

function parseExtractorJson(raw: string): ExtractorOutput | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
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
  const sanitize = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => typeof s === "string")
      .map((s) => (s as string).trim())
      .filter((s) => s.length > 0 && s.length <= 240);
  };
  return {
    additions: sanitize(obj.additions),
    updates: sanitize(obj.updates),
    invariants: sanitize(obj.invariants),
  };
}

/**
 * Merge extractor output into the existing memory markdown.
 *
 * Strategy: append a dated "Auto-captured" section at the end with
 * deduped bullets. Cap the section's total bullets so memory doesn't grow
 * unbounded. Existing user-edited sections above are left untouched.
 */
function mergeMemory(existing: string, extracted: ExtractorOutput): string {
  const existingTrim = (existing ?? "").trim();
  const MAX_BULLETS = 60;

  // Pull any existing auto-captured block so we can dedupe against it.
  const AUTO_HEADER = "## Auto-captured";
  const idx = existingTrim.indexOf(AUTO_HEADER);
  const before = idx >= 0 ? existingTrim.slice(0, idx).trimEnd() : existingTrim;
  const autoBlock = idx >= 0 ? existingTrim.slice(idx) : "";

  const previousBullets = autoBlock
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim());

  const allBullets = [
    ...previousBullets,
    ...extracted.invariants,
    ...extracted.additions,
    ...extracted.updates,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Dedupe — case-insensitive, keep first occurrence (existing > new).
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const b of allBullets) {
    const key = b.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(b);
  }

  // Trim to cap, preferring newer items at the BOTTOM (so older facts stay
  // at the top of the auto block, newest at the bottom).
  const trimmed = deduped.slice(Math.max(0, deduped.length - MAX_BULLETS));

  const newAutoBlock = [
    AUTO_HEADER,
    `_Last updated ${new Date().toISOString().slice(0, 10)} by system_`,
    "",
    ...trimmed.map((b) => `- ${b}`),
  ].join("\n");

  return [before, newAutoBlock].filter(Boolean).join("\n\n").trim() + "\n";
}

export async function maybeUpdateCompanionMemory(
  params: ExtractorParams
): Promise<void> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return;

    // Cadence check first — cheap query.
    const userMessageCount = await prisma.message.count({
      where: { conversationId: params.conversationId, role: "USER" },
    });
    if (userMessageCount < EXTRACT_EVERY_N_USER_MESSAGES) return;
    if (userMessageCount % EXTRACT_EVERY_N_USER_MESSAGES !== 0) return;

    const memory = await getMemory(params.companionId, params.userId);
    const existingMarkdown = memory?.memoryMarkdown ?? "";

    const recent = await prisma.message.findMany({
      where: {
        conversationId: params.conversationId,
        role: { in: ["USER", "ASSISTANT"] },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_MESSAGES_WINDOW,
      select: { role: true, content: true },
    });
    if (recent.length === 0) return;

    const transcript = recent
      .reverse()
      .map((m) => {
        const speaker = m.role === "USER" ? "User" : "Companion";
        const text = (m.content ?? "").trim();
        if (!text || text.startsWith("📸") || text.startsWith("🎬")) return "";
        return `${speaker}: ${text.slice(0, 500)}`;
      })
      .filter(Boolean)
      .join("\n");

    if (!transcript) return;

    const userPrompt = [
      "EXISTING MEMORY:",
      existingMarkdown.trim() || "(empty)",
      "",
      "RECENT TRANSCRIPT:",
      transcript,
      "",
      "Output the JSON now:",
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTRACTOR_TIMEOUT_MS);

    try {
      const model = process.env.MEMORY_EXTRACTOR_MODEL?.trim() || DEFAULT_EXTRACTOR_MODEL;
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
          temperature: 0.2,
          max_tokens: 600,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseExtractorJson(content);
      if (!parsed) return;

      const hasAny =
        parsed.additions.length > 0 ||
        parsed.updates.length > 0 ||
        parsed.invariants.length > 0;
      if (!hasAny) return;

      const merged = mergeMemory(existingMarkdown, parsed);
      if (merged.trim() === existingMarkdown.trim()) return;

      await updateMemory(
        params.companionId,
        params.userId,
        merged,
        `Auto extracted from ${RECENT_MESSAGES_WINDOW} recent messages`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn(
      "[memoryExtractor] failed:",
      err instanceof Error ? err.message : err
    );
  }
}
