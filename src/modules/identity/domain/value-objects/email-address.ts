import type {
  InvalidEmailError,
  InvalidEmailReason,
} from "../errors";

/**
 * EmailAddress — normalised, validated email string.
 *
 * Normalisation: lowercase + trimmed. Do all comparisons and lookups against
 * `.value`; never compare raw form input directly to a stored email.
 */
export class EmailAddress {
  private constructor(public readonly value: string) {}

  static create(
    raw: string,
  ): { ok: true; value: EmailAddress } | { ok: false; error: InvalidEmailError } {
    const trimmed = raw.trim().toLowerCase();

    const reason = validate(trimmed);
    if (reason) return { ok: false, error: { type: "invalid-email", reason } };

    return { ok: true, value: new EmailAddress(trimmed) };
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Deliberately permissive email regex. Full RFC 5322 compliance is neither
 * useful (real MTAs are more lenient than the spec) nor necessary — we send a
 * verification email in a later flow to prove reachability. Reject only the
 * shapes that are unambiguously wrong.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string): InvalidEmailReason | null {
  if (email.length === 0) return "empty";
  if (email.length > 254) return "too-long";
  if (!EMAIL_RE.test(email)) return "malformed";
  return null;
}
