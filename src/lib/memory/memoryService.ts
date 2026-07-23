import prisma from "@/lib/db";

export async function getMemory(companionId: string, userId: string) {
  return prisma.companionMemory.findFirst({
    where: { companionId, userId },
  });
}

export async function updateMemory(
  companionId: string,
  userId: string,
  newMarkdown: string,
  changeReason?: string
) {
  const existing = await prisma.companionMemory.findFirst({
    where: { companionId, userId },
  });

  if (!existing) {
    return prisma.companionMemory.create({
      data: {
        companionId,
        userId,
        memoryMarkdown: newMarkdown,
        version: 1,
      },
    });
  }

  // Archive current version
  await prisma.companionMemoryVersion.create({
    data: {
      companionId,
      memoryMarkdown: existing.memoryMarkdown,
      memoryJson: existing.memoryJson ?? undefined,
      version: existing.version,
      changedBy: userId,
      changeReason: changeReason ?? "User edit",
    },
  });

  return prisma.companionMemory.update({
    where: { id: existing.id },
    data: {
      memoryMarkdown: newMarkdown,
      version: { increment: 1 },
    },
  });
}

export async function getMemoryVersions(companionId: string) {
  return prisma.companionMemoryVersion.findMany({
    where: { companionId },
    orderBy: { version: "desc" },
    take: 10,
  });
}
