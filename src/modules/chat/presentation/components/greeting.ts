import type { CharacterSummaryDto } from "@/modules/characters";

/**
 * Seed greeting used to open a fresh conversation. Falls back through the
 * character's tagline → a relationship-flavored line → a generic hello,
 * so every character has *something* to say on first open even before the
 * LLM backend is wired up.
 *
 * TODO: once the chat/LLM module exists, replace this with a proper
 * "opening line" prompt run through the model with the character's system
 * prompt so greetings become contextual and unique per turn.
 */
export function greetingFor(c: CharacterSummaryDto): string {
  if (c.tagline && c.tagline.trim().length > 0) {
    return c.tagline.trim();
  }
  const rel = c.relationshipLabel.toLowerCase();
  if (rel.includes("girlfriend") || rel.includes("boyfriend")) {
    return `Hey love — I've been thinking about you all day.`;
  }
  if (rel.includes("stranger")) {
    return `I noticed you checking me out. Mind if I join you for a bit?`;
  }
  if (rel.includes("friend")) {
    return `Hey! Glad you dropped in — how's your day going?`;
  }
  return `Hey there. I'm ${c.name}. What's on your mind?`;
}
