"use server";

import { signOut } from "../../infrastructure/nextauth";

/**
 * Ends the session and redirects to the homepage. `signOut({ redirectTo: "/" })`
 * throws NEXT_REDIRECT which is the intended way to complete a server action
 * that finishes with a navigation.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
