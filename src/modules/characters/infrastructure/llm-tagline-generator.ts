import "server-only";
import type { ChatLlm } from "@/shared/application/llm/chat-llm";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type {
  TaglineGenerator,
  TaglineGeneratorInput,
  TaglineGeneratorOutput,
} from "../application/ports/tagline-generator";

/**
 * LlmTaglineGenerator — writes a Candy.ai-style scenario blurb for a
 * newly-created character. Resolves the `TAGLINE_GENERATOR` model config
 * at call time (60s cache), so admins can retarget from gpt-4o-mini to
 * something beefier (Claude Haiku, gpt-4o, etc.) without a redeploy.
 *
 * The prompt is tuned toward:
 *   - second-person voice ("Your rebellious stepsister…")
 *   - 2-3 sentences, no more (compact hooks read better in the sidebar)
 *   - a relational premise, not a bio dump
 *   - tone-matching against the personality + relationship + NSFW opt-in
 *
 * We deliberately keep the model output as plain text (no JSON schema).
 * A short creative task doesn't benefit from JSON, and the templated
 * fallback in the use case handles empty responses cleanly.
 */

const SYSTEM_PROMPT = `You write short, punchy scenario blurbs for AI companion characters. Users see them in a chat sidebar under the character's name — think of it like the pitch line on the back of a paperback novel.

RULES:
- Output PLAIN TEXT ONLY. No markdown. No quotation marks around the whole thing. No labels like "Scenario:".
- Address the reader in second person ("you", "your"). The reader IS the user chatting with this character.
- 2 to 3 sentences total. Ideal length: 25 to 55 words.
- Set up a RELATIONAL premise between the character and the reader. Who is this character to the reader? What's the current moment or tension?
- Match the character's personality, relationship archetype, and occupation — but SHOW them through the scenario, don't just restate them.
- Do NOT include the character's name inside the blurb. The UI shows the name separately right above your text.
- If NSFW is enabled, the blurb can hint at tension, chemistry, or attraction — but never explicit sex acts. Keep it PG-13 flirty at most.
- If NSFW is disabled, keep tone entirely SFW. Warm, curious, or witty — not romantic/suggestive.

Return ONLY the blurb text. Nothing else.`;

export class LlmTaglineGenerator implements TaglineGenerator {
  constructor(
    private readonly llm: ChatLlm,
    private readonly models: ModelConfigRepository,
  ) {}

  async generate(input: TaglineGeneratorInput): Promise<TaglineGeneratorOutput> {
    const model = await this.models.resolve("TAGLINE_GENERATOR");

    const userMessage = buildUserMessage(input);

    // The DB-side parameters (temperature, max_tokens) apply via
    // ResolvedModel.parameters — we don't need to override here. Keeping
    // overrides absent lets admin edits to the row (e.g. bumping
    // temperature for more variety) take effect immediately.
    const result = await this.llm.generate({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const cleaned = sanitize(result.content);
    return { tagline: cleaned };
  }
}

function buildUserMessage(input: TaglineGeneratorInput): string {
  const lines: string[] = [
    `Write the scenario blurb for a new character.`,
    ``,
    `- Age: ${input.ageYears}`,
    `- Gender: ${humanGender(input.gender)}`,
    `- Style: ${humanStyle(input.baseStyle)}`,
    `- Ethnicity: ${humanCase(input.ethnicity)}`,
    `- Personality: ${input.personalityLabel}`,
    `- Relationship to the user: ${input.relationshipLabel}`,
    `- Occupation: ${input.occupationLabel}`,
    `- Language: ${input.language}`,
    `- NSFW enabled: ${input.nsfwOptIn ? "yes" : "no"}`,
  ];
  if (input.hobbies.length > 0) {
    lines.push(`- Hobbies: ${input.hobbies.join(", ")}`);
  }
  const trimmedBackstory = input.backstory?.trim();
  if (trimmedBackstory && trimmedBackstory.length > 0) {
    lines.push(``);
    lines.push(`Backstory the writer supplied (weave it in only if it strengthens the hook):`);
    lines.push(trimmedBackstory);
  }
  lines.push(``);
  lines.push(
    `Now write the 2-3 sentence blurb. Second person. Do not include the character's name. Return only the blurb.`,
  );
  return lines.join("\n");
}

/**
 * Strip leading/trailing whitespace, wrapping quotes, and the occasional
 * "Scenario:" prefix the model likes to add despite instructions. Also
 * caps at 400 chars so a runaway response can't blow up the sidebar UI —
 * `characters.tagline` has no length constraint at the DB level but the
 * card layout expects ~2-3 sentences.
 */
function sanitize(raw: string): string {
  let t = raw.trim();
  // Peel outer quotes: "..." or '...'
  const first = t.charAt(0);
  const last = t.charAt(t.length - 1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    t = t.slice(1, -1).trim();
  }
  // Strip common label prefixes the model sometimes emits.
  t = t.replace(/^(scenario|blurb|description|bio)\s*:\s*/i, "");
  // Collapse internal blank lines — sidebar renders inline, blank lines
  // become awkward gaps. Keep single \n boundaries in case the model
  // returns two paragraphs.
  t = t.replace(/\n{2,}/g, "\n").trim();
  if (t.length > 400) t = t.slice(0, 400).trimEnd();
  return t;
}

function humanGender(g: string): string {
  switch (g) {
    case "FEMALE":
      return "female";
    case "MALE":
      return "male";
    case "NONBINARY":
      return "non-binary";
    default:
      return g.toLowerCase();
  }
}

function humanStyle(s: string): string {
  switch (s) {
    case "REALISTIC":
      return "photorealistic";
    case "ANIME":
      return "anime";
    case "THREE_D":
      return "3D-rendered";
    case "CARTOON":
      return "cartoon";
    default:
      return s.toLowerCase();
  }
}

function humanCase(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}
