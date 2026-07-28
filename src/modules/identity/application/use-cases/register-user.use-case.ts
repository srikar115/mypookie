import { err, ok, type Result } from "@/shared/application/result";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import { EmailAddress } from "../../domain/value-objects/email-address";
import { Password } from "../../domain/value-objects/password";
import type { UserDto } from "../dto/user.dto";
import type {
  EmailAlreadyInUseError,
  InvalidEmailError,
  InvalidPasswordError,
} from "../../domain/errors";
import type {
  PasswordHasher,
} from "../ports/password-hasher";
import type {
  UserRepository,
} from "../ports/user-repository";

export interface RegisterUserCommand {
  readonly email: string;
  readonly password: string;
  readonly name: string | null;
  readonly ageConfirmed: boolean;
  readonly tosAccepted: boolean;
  readonly privacyAccepted: boolean;
  readonly contentPolicyAccepted: boolean;
  readonly signupIp: string | null;
  readonly signupUserAgent: string | null;
}

export type RegisterUserError =
  | InvalidEmailError
  | InvalidPasswordError
  | EmailAlreadyInUseError
  | { type: "compliance-not-accepted" };

/**
 * RegisterUserUseCase — the single workflow that creates a new user.
 *
 * Depends only on abstractions: repository, hasher, clock, id generator.
 * Composition wires the concrete implementations in
 * `composition/identity.dependencies.ts`.
 */
export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: RegisterUserCommand,
  ): Promise<Result<UserDto, RegisterUserError>> {
    if (
      !input.ageConfirmed ||
      !input.tosAccepted ||
      !input.privacyAccepted ||
      !input.contentPolicyAccepted
    ) {
      return err({ type: "compliance-not-accepted" as const });
    }

    const emailResult = EmailAddress.create(input.email);
    if (!emailResult.ok) return err(emailResult.error);

    const passwordResult = Password.create(input.password);
    if (!passwordResult.ok) return err(passwordResult.error);

    const existing = await this.users.findByEmail(emailResult.value);
    if (existing) return err({ type: "email-already-in-use" as const });

    const passwordHash = await this.hasher.hash(passwordResult.value.value);
    const now = this.clock.now();

    const created = await this.users.create({
      id: this.ids.next(),
      email: emailResult.value,
      passwordHash,
      name: input.name,
      compliance: {
        ageConfirmedAt: now,
        tosAcceptedAt: now,
        privacyAcceptedAt: now,
        contentPolicyAcceptedAt: now,
      },
      signupIp: input.signupIp,
      signupUserAgent: input.signupUserAgent,
    });

    if ("type" in created) return err(created);

    return ok({
      id: created.id,
      email: created.email.value,
      name: created.name,
      role: created.role,
    });
  }
}
