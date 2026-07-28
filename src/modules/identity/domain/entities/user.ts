import { EmailAddress } from "../value-objects/email-address";
import type { ComplianceIncompleteError } from "../errors";

export type UserRole = "USER" | "ADMIN" | "MODERATOR";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_VERIFICATION";

/**
 * ComplianceFlags — the four attestations we must record before a user is
 * allowed to sign in. Section SB 243 (California) + the EU AI Act require
 * per-user records of age and policy acceptance timestamps; we store the
 * *when* not just the *yes*.
 */
export interface ComplianceFlags {
  readonly ageConfirmedAt: Date | null;
  readonly tosAcceptedAt: Date | null;
  readonly privacyAcceptedAt: Date | null;
  readonly contentPolicyAcceptedAt: Date | null;
}

export interface UserProps {
  readonly id: string;
  readonly email: EmailAddress;
  readonly name: string | null;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly compliance: ComplianceFlags;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }
  get email(): EmailAddress {
    return this.props.email;
  }
  get name(): string | null {
    return this.props.name;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get role(): UserRole {
    return this.props.role;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get compliance(): ComplianceFlags {
    return this.props.compliance;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /**
   * A user may sign in when their status is ACTIVE and all four compliance
   * flags have been recorded. The compliance error names exactly which
   * attestations are missing so presentation can prompt for the right one.
   */
  canSignIn():
    | { ok: true }
    | { ok: false; error: ComplianceIncompleteError | { type: "suspended" } } {
    if (this.props.status === "SUSPENDED") {
      return { ok: false, error: { type: "suspended" } };
    }

    const missing: ComplianceIncompleteError["missing"][number][] = [];
    if (!this.props.compliance.ageConfirmedAt) missing.push("age");
    if (!this.props.compliance.tosAcceptedAt) missing.push("tos");
    if (!this.props.compliance.privacyAcceptedAt) missing.push("privacy");
    if (!this.props.compliance.contentPolicyAcceptedAt)
      missing.push("content-policy");

    if (missing.length) {
      return {
        ok: false,
        error: { type: "compliance-incomplete", missing },
      };
    }
    return { ok: true };
  }
}
