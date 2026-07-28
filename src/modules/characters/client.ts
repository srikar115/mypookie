/**
 * Public API for the characters module — client-safe entry points only.
 *
 * Only components, hooks, and server-action bindings should be exported
 * here. Anything importing `server-only`, Prisma, fal, or Redis belongs
 * in `./index.ts`.
 */

export { CharacterWizard } from "./presentation/components/CharacterWizard";
export type { CharacterWizardProps } from "./presentation/components/CharacterWizard";

export { MyAiGrid } from "./presentation/components/MyAiGrid";
