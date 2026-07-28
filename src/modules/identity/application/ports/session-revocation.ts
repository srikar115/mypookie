/**
 * SessionRevocationPort — the application-facing contract for cutting
 * currently-issued sessions off from the app before their natural expiry.
 *
 * Auth.js v5's Credentials provider only supports JWT sessions, meaning the
 * cookie IS the session — there is no server-side row to delete. This port
 * exists so a suspension / kick action can flip a fast-check flag that every
 * `auth()` call consults, without paying the cost of a database round-trip
 * per request.
 *
 * Implementations must be fast (single-digit ms) because `isRevoked` runs
 * inside the NextAuth JWT callback on every authenticated request.
 */
export interface SessionRevocationPort {
  /** Mark every currently-issued session for this user as invalid. */
  revokeUser(userId: string): Promise<void>;

  /** Reinstate a previously-revoked user (e.g. suspension lifted). */
  reinstateUser(userId: string): Promise<void>;

  /** Fast path: is this user currently in the revocation list? */
  isRevoked(userId: string): Promise<boolean>;
}
