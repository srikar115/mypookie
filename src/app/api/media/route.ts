import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "image" | "video" | null
  const companionId = searchParams.get("companionId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));

  const where = {
    userId,
    ...(type === "image" ? { type: "IMAGE" as const } : type === "video" ? { type: "VIDEO" as const } : {}),
    ...(companionId ? { companionId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mediaGeneration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        type: true,
        status: true,
        storageUrl: true,
        thumbnailUrl: true,
        userRequest: true,
        prompt: true,
        aspectRatio: true,
        style: true,
        durationSeconds: true,
        modelSlug: true,
        creditsUsed: true,
        creditsReserved: true,
        errorMessage: true,
        completedAt: true,
        createdAt: true,
        companion: { select: { id: true, name: true } },
      },
    }),
    prisma.mediaGeneration.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await prisma.mediaGeneration.findFirst({ where: { id, userId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mediaGeneration.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
