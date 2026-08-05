import "server-only";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type { VisualSceneGrounder } from "../../application/ports/visual-scene-grounder";
import type { ConversationTurn } from "../../application/ports/recent-conversation-reader";

/**
 * Resolves SUMMARIZER rather than CHAT. The task is "read this exchange and
 * state what she is doing", which is the summarizer's job description, and it
 * keeps a per-photo utility call off the expensive roleplay model. It is also
 * the knob an admin would reach for if grounded scenes came back weak.
 */
const MODEL_PURPOSE = "SUMMARIZER" as const;

const SYSTEM_PROMPT = `You write the caption-free visual description of a photo a character is about to take of herself, given the conversation she is in.

Return ONLY the description. No preamble, no quotes, no explanation, no camera brand names.

Rules:
- Describe what SHE is doing right now, drawn from the conversation. If she just said she was eating an apple, she is eating an apple in the photo.
- Include: her action or pose, the setting around her, and the framing (selfie, mirror shot, close-up, waist-up). Add lighting only if the conversation implies a time or place.
- Describe clothing only if the conversation established it. Never invent an outfit that contradicts what was said.
- Do NOT describe her face, hair, eye colour, body, age, or ethnicity. Those come from her reference photo and repeating them creates a second, competing person.
- Do NOT mention the user, or anyone else. She is alone in the frame.
- Present tense, one sentence, under 40 words.
- If the conversation gives you nothing to work with, describe an ordinary candid moment consistent with its mood.`;

/** Long enough to catch "what are you doing" → "eating an apple" → "share your pic". */
const MAX_WORDS = 60;

export class LlmVisualSceneGrounder implements VisualSceneGrounder {
  constructor(
    private readonly llm: ChatLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async ground(input: {
    userRequest: string;
    characterName: string;
    recentTurns: readonly ConversationTurn[];
    kind: "IMAGE" | "VIDEO";
  }): Promise<string | null> {
    if (input.recentTurns.length === 0) return null;

    try {
      const model = await this.models.resolve(MODEL_PURPOSE);
      const transcript = input.recentTurns
        .map(
          (t) =>
            `${t.role === "user" ? "USER" : input.characterName.toUpperCase()}: ${t.content}`,
        )
        .join("\n");

      const userBody = [
        `Character: ${input.characterName}`,
        `Medium: ${input.kind === "VIDEO" ? "a few seconds of video" : "a photo"}`,
        "",
        "Conversation so far:",
        transcript,
        "",
        `She was just asked: "${input.userRequest.trim() || "send a pic"}"`,
        "",
        "Describe the shot she sends.",
      ].join("\n");

      const result = await this.llm.generate({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userBody },
        ],
        // Small models like to answer "Sure! Here's the description:" and then
        // wrap the scene in quotes. A tight ceiling plus the cleanup below is
        // cheaper than a retry loop.
        overrides: { maxTokens: 120, temperature: 0.8 },
      });

      return cleanScene(result.content);
    } catch (e) {
      // A generation the user is paying for must not fail because the scene
      // could not be enriched. The caller keeps the original text.
      console.warn("[media] scene grounding failed", e);
      return null;
    }
  }
}

/**
 * Strips the scaffolding small models wrap around a one-line answer, and
 * rejects anything that came back too long to be a scene (usually the model
 * explaining itself instead of complying).
 */
function cleanScene(raw: string): string | null {
  let text = raw.trim();
  if (text.length === 0) return null;

  // "Here's the description:" / "Photo description:" and similar.
  text = text.replace(/^[^:\n]{0,40}:\s*/, "");
  // Surrounding quotes, and a trailing sentence of commentary after a newline.
  text = text.split("\n")[0]!.trim();
  text = text.replace(/^["'“”']+|["'“”']+$/g, "").trim();

  if (text.length === 0) return null;
  if (text.split(/\s+/).length > MAX_WORDS) return null;
  return text;
}
