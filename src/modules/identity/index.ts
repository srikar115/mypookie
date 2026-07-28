import "server-only";

/**
 * Public API for the `identity` module — server surface.
 *
 * Other modules and `src/app/` may import ONLY from this file (server) or
 * `./client` (client). Deep imports like
 * `@/modules/identity/infrastructure/nextauth` are forbidden — see
 * `.cursor/rules/architecture.mdc` rule 7 and the ESLint boundaries.
 */

export { handlers, auth, signIn, signOut } from "./infrastructure/nextauth";
export { createRegisterUserUseCase } from "./composition/identity.dependencies";
export type { UserDto } from "./application/dto/user.dto";
