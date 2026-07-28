import { redirect } from "next/navigation";
import { auth } from "@/modules/identity";

/**
 * Auth gate for the /create route.
 *
 * The public layout already wraps this segment with PublicShell + Footer,
 * so we just need to redirect anonymous visitors away. We send them home
 * with a `?login=1` hint so the shell can auto-open the login modal (a
 * follow-up wiring — the flag is harmless if unread).
 */
export default async function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || !(session.user as { id?: string }).id) {
    redirect("/?login=1");
  }
  return <>{children}</>;
}
