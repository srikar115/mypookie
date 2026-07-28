import { auth } from "@/modules/identity";
import { PublicShell } from "@/components/public/PublicShell";
import { Footer } from "@/components/public/Footer";
import type { SessionUser } from "@/modules/identity/client";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const sessionUser: SessionUser | null =
    session?.user && (session.user as { id?: string }).id
      ? {
          id: (session.user as { id: string }).id,
          email: session.user.email ?? null,
          name: session.user.name ?? null,
          role: (session.user as { role?: string }).role ?? "USER",
        }
      : null;

  return (
    <PublicShell user={sessionUser}>
      {children}
      <Footer />
    </PublicShell>
  );
}
