import "server-only";
import type { MemoryFactDraft } from "../../domain/fact";

/**
 * FactExtractor — turns a completed (user turn, assistant turn) pair into
 * a bounded list of {@link MemoryFactDraft} rows. Implementations MUST be
 * defensive: LLM output is untrusted (missing keys, wrong types, empty
 * strings) and should be filtered.
 */
export interface FactExtractor {
  extract(input: {
    characterName: string;
    userMessage: string;
    assistantMessage: string;
  }): Promise<MemoryFactDraft[]>;
}
