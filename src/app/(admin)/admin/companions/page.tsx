import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminCompanionsClient } from "./AdminCompanionsClient";

export const metadata = { title: "Companions — Admin" };

export default async function AdminCompanionsPage() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    redirect("/admin");
  }

  const companions = await prisma.companion.findMany({
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
      personalityPreset: true,
      avatarUrl: true,
      status: true,
      isPublic: true,
      createdAt: true,
    },
  });

  return <AdminCompanionsClient initialCompanions={companions} />;
}
