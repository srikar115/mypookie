/**
 * PasswordHasher — the application-facing contract for password hashing.
 * Implemented by `BcryptPasswordHasher` in infrastructure.
 *
 * The port is deliberately narrow: use cases don't care which algorithm
 * hashes — they just need "hash this" and "verify this". Rotating from
 * bcrypt to argon2 tomorrow is a single-adapter change.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}
