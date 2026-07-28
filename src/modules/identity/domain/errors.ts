/**
 * Domain errors for the identity module. These are the *expected* failures
 * that use cases surface via `Result<T, E>`. Unexpected failures (DB down,
 * bcrypt CPU error) are thrown and caught at the presentation boundary.
 */

export type InvalidEmailReason = "empty" | "too-long" | "malformed";

export interface InvalidEmailError {
  readonly type: "invalid-email";
  readonly reason: InvalidEmailReason;
}

export type InvalidPasswordReason =
  | "too-short"
  | "too-long"
  | "missing-lowercase"
  | "missing-uppercase"
  | "missing-digit";

export interface InvalidPasswordError {
  readonly type: "invalid-password";
  readonly reason: InvalidPasswordReason;
}

export interface EmailAlreadyInUseError {
  readonly type: "email-already-in-use";
}

export interface ComplianceIncompleteError {
  readonly type: "compliance-incomplete";
  readonly missing: readonly (
    | "age"
    | "tos"
    | "privacy"
    | "content-policy"
  )[];
}
