import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBalance } from "@/lib/billing/creditService";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { SidebarAwareMain } from "@/components/app/SidebarAwareMain";
import prisma from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id as string;

  const [credits, recentConversations] = await Promise.all([
    getBalance(userId),
    prisma.conversation.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { lastMessageAt: "desc" },
      take: 3,
      select: {
        lastMessageAt: true,
        companion: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
  ]);

  const recentChats = recentConversations.map((c) => ({
    companionId: c.companion.id,
    companionName: c.companion.name,
    avatarUrl: c.companion.avatarUrl,
    lastMessageAt: c.lastMessageAt,
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Sidebar recentChats={recentChats} />
      <SidebarAwareMain>
        <Topbar
          user={{
            name: session.user.name,
            email: session.user.email,
            role: (session.user as { role?: string }).role,
          }}
          credits={credits}
        />
        <main className="pt-16 min-h-screen">
          <div className="p-6 max-w-7xl mx-auto">{children}</div>
        </main>
      </SidebarAwareMain>
    </div>
  );
}
