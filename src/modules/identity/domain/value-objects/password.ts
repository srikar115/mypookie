import type {
  InvalidPasswordError,
  InvalidPasswordReason,
} from "../errors";

/**
 * Password — a plaintext password that has passed strength checks but is not
 * yet hashed.
 *
 * Rules:
 *   - min length 8, max length 128 (bcrypt truncates at 72 bytes, but we
 *     accept the extra headroom for forward compatibility)
 *   - must contain at least one lowercase, uppercase, and digit
 *
 * Never persist a `Password` instance — hash it via the PasswordHasher port
 * before storage. This class exists so use cases can accept validated inputs
 * without repeating rules across sign-up, password reset, and change-password.
 */
export class Password {
  private constructor(public readonly value: string) {}

  static create(
    raw: string,
  ): { ok: true; value: Password } | { ok: false; error: InvalidPasswordError } {
    const reason = validate(raw);
    if (reason) return { ok: false, error: { type: "invalid-password", reason } };
    return { ok: true, value: new Password(raw) };
  }
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

function validate(password: string): InvalidPasswordReason | null {
  if (password.length < MIN_LENGTH) return "too-short";
  if (password.length > MAX_LENGTH) return "too-long";
  if (!/[a-z]/.test(password)) return "missing-lowercase";
  if (!/[A-Z]/.test(password)) return "missing-uppercase";
  if (!/[0-9]/.test(password)) return "missing-digit";
  return null;
}
