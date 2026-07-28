/**
 * Serializable view of a user for presentation. Never leak `passwordHash`,
 * compliance timestamps, or IP/user-agent from this DTO.
 */
export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: "USER" | "ADMIN" | "MODERATOR";
}
