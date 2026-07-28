import { redirect } from "next/navigation";
import { auth } from "@/modules/identity";

/**
 * Auth gate for /chat. Mirrors the /create gate: anonymous visitors are
 * bounced home with a hint that triggers the login modal. Any user session
 * shape that lacks an `id` is treated as anonymous — this defends against
 * a stale JWT surviving a database wipe.
 */
export default async function ChatLayout({
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
