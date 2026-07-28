import type { EmailAddress } from "../../domain/value-objects/email-address";
import type { User, UserProps } from "../../domain/entities/user";

/**
 * UserRepository — the application-facing contract for user persistence.
 * Implemented by `PrismaUserRepository` in infrastructure. Use cases depend
 * only on this interface.
 */
export interface UserRepository {
  findByEmail(email: EmailAddress): Promise<User | null>;
  findById(id: string): Promise<User | null>;

  /**
   * Create a new user record. Callers pre-validate uniqueness where possible,
   * but implementations must still translate a unique-violation error into
   * `{ type: "email-already-in-use" }` in case of a race.
   */
  create(input: CreateUserInput): Promise<User | EmailAlreadyInUseFailure>;
}

export interface CreateUserInput {
  readonly id: string;
  readonly email: EmailAddress;
  readonly passwordHash: string;
  readonly name: string | null;
  readonly compliance: Pick<
    UserProps["compliance"],
    | "ageConfirmedAt"
    | "tosAcceptedAt"
    | "privacyAcceptedAt"
    | "contentPolicyAcceptedAt"
  >;
  readonly signupIp: string | null;
  readonly signupUserAgent: string | null;
}

export interface EmailAlreadyInUseFailure {
  readonly type: "email-already-in-use";
}
