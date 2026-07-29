import { redirect } from "next/navigation";
import { auth } from "@/modules/identity";

/**
 * Auth gate for `/ai-girlfriend/[slug]`. Mirrors the /chat gate:
 * anonymous visitors bounce to the marketing homepage with a hint that
 * pops the login modal. This route always resolves against a concrete
 * conversation the visitor must own, so gating at the layer above the
 * page keeps the auth check off the critical rendering path.
 */
export default async function AiGirlfriendLayout({
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
