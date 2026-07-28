import { err, ok, type Result } from "@/shared/application/result";
import { EmailAddress } from "../../domain/value-objects/email-address";
import type { UserDto } from "../dto/user.dto";
import type { PasswordHasher } from "../ports/password-hasher";
import type { UserRepository } from "../ports/user-repository";

export interface AuthenticateUserCommand {
  readonly email: string;
  readonly password: string;
}

export type AuthenticateUserError =
  | { type: "invalid-credentials" }
  | { type: "suspended" }
  | {
      type: "compliance-incomplete";
      missing: readonly ("age" | "tos" | "privacy" | "content-policy")[];
    };

/**
 * AuthenticateUserUseCase — the sole workflow that verifies a login attempt.
 *
 * Called from the NextAuth Credentials `authorize` callback. Depends only on
 * abstractions: `UserRepository` + `PasswordHasher`. Composition wires the
 * concrete implementations.
 *
 * Failure modes are all collapsed to `invalid-credentials` at the caller
 * boundary to avoid leaking whether an email is registered — but the use case
 * distinguishes them internally so we can act on `suspended` /
 * `compliance-incomplete` differently in the future (e.g. redirect the user to
 * a "confirm your compliance flags" screen).
 */
export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(
    input: AuthenticateUserCommand,
  ): Promise<Result<UserDto, AuthenticateUserError>> {
    const emailResult = EmailAddress.create(input.email);
    if (!emailResult.ok) return err({ type: "invalid-credentials" as const });

    const user = await this.users.findByEmail(emailResult.value);
    if (!user) return err({ type: "invalid-credentials" as const });
    if (!user.passwordHash) return err({ type: "invalid-credentials" as const });

    const valid = await this.hasher.verify(input.password, user.passwordHash);
    if (!valid) return err({ type: "invalid-credentials" as const });

    const gate = user.canSignIn();
    if (!gate.ok) {
      if (gate.error.type === "suspended") {
        return err({ type: "suspended" as const });
      }
      return err({
        type: "compliance-incomplete" as const,
        missing: gate.error.missing,
      });
    }

    return ok({
      id: user.id,
      email: user.email.value,
      name: user.name,
      role: user.role,
    });
  }
}
