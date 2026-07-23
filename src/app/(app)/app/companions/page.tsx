import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCompanionsByUser } from "@/lib/companions/companionService";
import prisma from "@/lib/db";
import { CompanionsPageClient } from "./CompanionsPageClient";

export const metadata = { title: "Companions" };

export default async function CompanionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { tab } = await searchParams;

  const [userCompanions, publicCompanions] = await Promise.all([
    getCompanionsByUser(session.user.id as string),
    prisma.companion.findMany({
      where: { isPublic: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        companionType: true,
        genderPresentation: true,
        ageStyle: true,
        visualStyle: true,
        overallVibe: true,
        avatarUrl: true,
        customAppearanceNotes: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <CompanionsPageClient
      userCompanions={userCompanions}
      publicCompanions={publicCompanions}
      defaultTab={tab === "mine" ? "mine" : "browse"}
    />
  );
}
