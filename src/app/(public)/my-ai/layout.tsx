import { redirect } from "next/navigation";
import { auth } from "@/modules/identity";

/**
 * Auth gate for /my-ai. Same shape as /chat and /create — anonymous
 * requests bounce home with `?login=1` so the shell can auto-open the
 * login modal.
 */
export default async function MyAiLayout({
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
