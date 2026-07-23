import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateCompanionAvatar } from "@/lib/companions/companionService";

/**
 * POST /api/admin/companions/generate-all-avatars
 * Queues avatar generation for every public companion with no avatarUrl.
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companions = await prisma.companion.findMany({
    where: { isPublic: true, avatarUrl: null },
    select: { id: true, name: true },
  });

  companions.forEach(({ id }) => {
    generateCompanionAvatar(id).catch(console.error);
  });

  return NextResponse.json({ queued: companions.length, companions: companions.map((c) => c.name) });
}
