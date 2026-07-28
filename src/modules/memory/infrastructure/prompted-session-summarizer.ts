import "server-only";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type {
  SessionSummarizer,
  SummarizerTurn,
} from "../application/ports/session-summarizer";

const SYSTEM_PROMPT = `You compress a segment of a long-running roleplay chat into a compact retrieval-friendly summary.

Return ONE paragraph (3-6 sentences) capturing:
- Named entities the user mentioned (people, places, pets).
- Ongoing plans / commitments / open questions.
- Emotional tone of the segment.
- Any relationship shifts (closer, tense, teasing, protective).

Never speak in character. Never invent facts. If a prior summary is provided, integrate it — do NOT restate every point, just carry the durable ones forward.`;

/**
 * PromptedSessionSummarizer — resolves SUMMARIZER via ModelConfig on every
 * call. Non-streaming (single well-formed reply, no UX-facing tokens).
 */
export class PromptedSessionSummarizer implements SessionSummarizer {
  constructor(
    private readonly llm: ChatLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async summarize(input: {
    characterName: string;
    priorSummary: string | null;
    turns: readonly SummarizerTurn[];
  }): Promise<string> {
    const model = await this.models.resolve("SUMMARIZER");
    const transcript = input.turns
      .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
      .join("\n");
    const userBody = [
      `Companion: ${input.characterName}`,
      input.priorSummary && input.priorSummary.trim().length > 0
        ? `Prior summary:\n${input.priorSummary.trim()}`
        : "(no prior summary)",
      "",
      "Transcript:",
      transcript,
    ].join("\n");

    const result = await this.llm.generate({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userBody },
      ],
    });
    return result.content.trim();
  }
}
