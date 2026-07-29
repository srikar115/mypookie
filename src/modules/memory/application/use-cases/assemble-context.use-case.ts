import "server-only";
import type { MemoryContextProvider } from "@/modules/chat";
import { env } from "@/config/env";
import type { HybridSearcher } from "../ports/hybrid-searcher";
import type { MemoryStore } from "../ports/memory-store";
import type { RelationshipStore } from "../ports/relationship-store";

/**
 * AssembleContext — the memory module's implementation of chat's
 * {@link MemoryContextProvider} port. Runs on every user turn just before
 * the LLM stream opens.
 *
 * Composition sketch:
 *   Layer 3b: structuredFacts (name, birthday, job) — cheap KV read
 *   Layer 2:  relationship state summary — one row
 *   Layer 2:  session summary — one row
 *   Layer 2:  top-K facts via BM25 + entity + recency hybrid
 *
 * Concatenates them into a single labelled block. If MEMORY_ENABLED is
 * false, returns the empty string so chat degrades gracefully.
 */
export class AssembleContextUseCase implements MemoryContextProvider {
  constructor(
    private readonly memoryStore: MemoryStore,
    private readonly searcher: HybridSearcher,
    private readonly relationships: RelationshipStore,
  ) {}

  async getMemoryBlock(input: {
    userId: string;
    characterId: string;
    conversationId: string;
    userMessage: string;
    userDisplayName?: string | null;
  }): Promise<string> {
    if (!env.MEMORY_ENABLED) return "";

    const entities = extractEntitiesHeuristic(input.userMessage);
    const [structured, summary, relationship, facts] = await Promise.all([
      this.memoryStore.readStructuredFacts(input.userId),
      this.memoryStore.readSessionSummary(input.conversationId),
      this.relationships.read({
        userId: input.userId,
        characterId: input.characterId,
      }),
      this.searcher.search({
        userId: input.userId,
        characterId: input.characterId,
        query: input.userMessage,
        entities,
        limit: env.MEMORY_TOP_K,
      }),
    ]);

    // Fallback layer: if memory hasn't yet captured the user's name via
    // fact extraction, use the display name from auth. Any structured
    // fact wins over the fallback so the memory extractor stays
    // authoritative once it has learned the user's preferred name.
    const merged: Record<string, unknown> = { ...structured };
    const trimmedName = input.userDisplayName?.trim();
    if (trimmedName && trimmedName.length > 0 && !merged["name"]) {
      merged["name"] = trimmedName;
    }

    const sections: string[] = [];

    if (Object.keys(merged).length > 0) {
      sections.push("USER PROFILE:");
      for (const [k, v] of Object.entries(merged)) {
        sections.push(`  · ${k}: ${stringifyValue(v)}`);
      }
    }

    if (relationship) {
      sections.push(
        `RELATIONSHIP: tier=${relationship.tier}, affinity=${Math.round(relationship.affinity)}, ` +
          `trust=${Math.round(relationship.trust)}, affection=${Math.round(relationship.affection)}, ` +
          `messages=${relationship.totalMessages}, streak=${relationship.streakDays}d`,
      );
    }

    if (summary && summary.summary.trim().length > 0) {
      sections.push("PRIOR SESSIONS SUMMARY:");
      sections.push(summary.summary.trim());
    }

    if (facts.length > 0) {
      sections.push("RELEVANT MEMORIES:");
      for (const f of facts) {
        sections.push(`  · [${f.category}] ${f.content}`);
      }
    }

    return sections.join("\n");
  }
}

/**
 * Cheap entity extractor for retrieval: pulls capitalized tokens that are
 * plausibly proper nouns. Not perfect, but paired with the entity GIN
 * index it's enough to catch "Max", "Sarah", "New York" in the user turn.
 * The LLM-driven fact extractor produces the authoritative entity list on
 * the ingest path.
 */
function extractEntitiesHeuristic(text: string): readonly string[] {
  const out = new Set<string>();
  const tokens = text.split(/[\s,.!?;:()"']+/);
  for (const t of tokens) {
    if (t.length < 3) continue;
    // First-letter uppercase, rest not all uppercase (avoids "OK", "USA" edge cases).
    if (t[0] >= "A" && t[0] <= "Z" && t !== t.toUpperCase()) {
      out.add(t);
    }
  }
  return Array.from(out);
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "unknown";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
