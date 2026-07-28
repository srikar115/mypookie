import "server-only";
import bcrypt from "bcryptjs";
import type { PasswordHasher } from "../application/ports/password-hasher";

/**
 * Bcrypt implementation of PasswordHasher. Cost 12 balances security vs.
 * server CPU (~250ms per hash on a modern core). Do not lower below 10.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  private static readonly ROUNDS = 12;

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, BcryptPasswordHasher.ROUNDS);
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
