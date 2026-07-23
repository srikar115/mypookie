import prisma from "@/lib/db";

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
) {
  return prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      details: (details ?? {}) as import("@prisma/client").Prisma.InputJsonValue,
      ipAddress: ipAddress ?? null,
    },
  });
}

export async function getAuditLogs(limit = 50, offset = 0) {
  return prisma.adminAuditLog.findMany({
    include: { admin: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}
