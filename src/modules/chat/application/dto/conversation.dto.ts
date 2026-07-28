/**
 * Conversation DTO — the shape presentation and streaming code reads. Keeps
 * the wire surface trim; heavier per-message payloads live in `MessageDto`.
 */
export interface ConversationDto {
  readonly id: string;
  readonly userId: string;
  readonly characterId: string;
  readonly title: string | null;
  readonly lastMessageAt: string;
  readonly createdAt: string;
}
