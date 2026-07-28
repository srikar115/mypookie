/**
 * MessageRole / MessageStatus mirror the DB enums but are declared here as
 * plain TS unions so the application layer stays framework-free (rule 4).
 * Values match the Prisma enum literals so adapters can pass them through.
 */
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type MessageStatus = "READY" | "FAILED";

/**
 * MessageDto — provider-agnostic message shape read by the UI and the
 * streaming route. The `role` values mirror the DB enum ('USER',
 * 'ASSISTANT', 'SYSTEM') so no translation layer sits between the wire and
 * persistence.
 */
export interface MessageDto {
  readonly id: string;
  readonly conversationId: string;
  readonly role: MessageRole;
  readonly status: MessageStatus;
  readonly content: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly modelId: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
}
