/**
 * Result<T, E> — the standard return shape for every use case in the app.
 *
 * Use it for *expected* failures ("insufficient credits", "email in use",
 * "provider rate-limited") that presentation layers must handle explicitly.
 * Reserve `throw` for genuinely exceptional situations (invariant violations,
 * infrastructure bugs) that must halt the current request and be surfaced by
 * error boundaries + logging.
 *
 * Example:
 *
 *   const result = await createGeneration.execute(input);
 *   if (!result.ok) return mapGenerationError(result.error);
 *   return result.value;
 */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok;
}
