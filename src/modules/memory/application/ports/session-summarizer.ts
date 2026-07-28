import "server-only";

/**
 * Compact projection of a conversation's recent turns used by the
 * summarizer. Keeps LLM adapters free of message-repo internals.
 */
export interface SummarizerTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * SessionSummarizer — condenses the last N turns of a conversation into a
 * paragraph the {@link AssembleContextUseCase} injects into the memory
 * block. Called every `CHAT_SESSION_SUMMARY_EVERY_N_TURNS` turns.
 */
export interface SessionSummarizer {
  summarize(input: {
    characterName: string;
    priorSummary: string | null;
    turns: readonly SummarizerTurn[];
  }): Promise<string>;
}
