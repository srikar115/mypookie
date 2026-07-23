import prisma from "@/lib/db";
import { TransactionType, ReservationStatus } from "@prisma/client";

// ─── Wallet ────────────────────────────────────────────────────────────────────

export async function getWallet(userId: string) {
  return prisma.creditWallet.findUnique({ where: { userId } });
}

export async function getBalance(userId: string): Promise<number> {
  const wallet = await getWallet(userId);
  return wallet?.balance ?? 0;
}

export async function ensureWallet(userId: string) {
  return prisma.creditWallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 },
  });
}

// ─── Grant / add credits ───────────────────────────────────────────────────────

export async function grantCredits(
  userId: string,
  amount: number,
  description: string,
  type: TransactionType = TransactionType.CREDIT_GRANT,
  referenceId?: string
) {
  if (amount <= 0) throw new Error("Credit amount must be positive");

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { balance: { increment: amount } },
      create: { userId, balance: amount },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        amount,
        type,
        description,
        referenceId: referenceId ?? null,
        balanceAfter: wallet.balance,
      },
    });

    return wallet;
  });
}

export async function grantTrialCredits(userId: string) {
  const trialCredits = parseInt(
    process.env.NEW_USER_TRIAL_CREDITS ?? "100",
    10
  );
  return grantCredits(
    userId,
    trialCredits,
    "Welcome bonus — trial credits",
    TransactionType.CREDIT_GRANT,
    "trial"
  );
}

// ─── Deduct credits ────────────────────────────────────────────────────────────

export async function deductCredits(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string
): Promise<{ success: boolean; balance: number; error?: string }> {
  if (amount <= 0) throw new Error("Deduction amount must be positive");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < amount) throw new Error("INSUFFICIENT_CREDITS");

      const updated = await tx.creditWallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: -amount,
          type: TransactionType.CREDIT_DEDUCTION,
          description,
          referenceId: referenceId ?? null,
          balanceAfter: updated.balance,
        },
      });

      return updated;
    });

    return { success: true, balance: result.balance };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      const wallet = await getWallet(userId);
      return { success: false, balance: wallet?.balance ?? 0, error: "Insufficient credits" };
    }
    throw error;
  }
}

// ─── Reserve credits (for async jobs like video) ───────────────────────────────

export async function reserveCredits(
  userId: string,
  amount: number,
  source: string,
  sourceId?: string
): Promise<{ success: boolean; reservationId?: string; balance?: number; error?: string }> {
  if (amount <= 0) throw new Error("Reserve amount must be positive");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < amount) throw new Error("INSUFFICIENT_CREDITS");

      const updated = await tx.creditWallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      const reservation = await tx.creditReservation.create({
        data: {
          userId,
          amount,
          status: ReservationStatus.RESERVED,
          source,
          sourceId: sourceId ?? null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: -amount,
          type: TransactionType.CREDIT_RESERVATION,
          description: `Reserved for ${source}`,
          referenceId: reservation.id,
          balanceAfter: updated.balance,
        },
      });

      return { wallet: updated, reservationId: reservation.id };
    });

    return { success: true, reservationId: result.reservationId, balance: result.wallet.balance };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      const wallet = await getWallet(userId);
      return { success: false, balance: wallet?.balance ?? 0, error: "Insufficient credits" };
    }
    throw error;
  }
}

export async function finalizeReservedCredits(
  reservationId: string
): Promise<void> {
  const reservation = await prisma.creditReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.status !== ReservationStatus.RESERVED) return;

  await prisma.$transaction(async (tx) => {
    await tx.creditReservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.FINALIZED, finalizedAt: new Date() },
    });

    const wallet = await tx.creditWallet.findUnique({ where: { userId: reservation.userId } });
    await tx.creditTransaction.create({
      data: {
        userId: reservation.userId,
        walletId: wallet!.id,
        amount: 0,
        type: TransactionType.CREDIT_RESERVATION_FINALIZE,
        description: `Finalized reservation for ${reservation.source}`,
        referenceId: reservationId,
        balanceAfter: wallet!.balance,
      },
    });
  });
}

export async function refundReservedCredits(
  reservationId: string,
  reason?: string
): Promise<void> {
  const reservation = await prisma.creditReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.status !== ReservationStatus.RESERVED) return;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.creditWallet.update({
      where: { userId: reservation.userId },
      data: { balance: { increment: reservation.amount } },
    });

    await tx.creditReservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.REFUNDED, refundedAt: new Date() },
    });

    await tx.creditTransaction.create({
      data: {
        userId: reservation.userId,
        walletId: updated.id,
        amount: reservation.amount,
        type: TransactionType.CREDIT_RESERVATION_REFUND,
        description: reason ?? `Refunded reservation for ${reservation.source}`,
        referenceId: reservationId,
        balanceAfter: updated.balance,
      },
    });
  });
}

// ─── Subscription credit allocation ───────────────────────────────────────────

export async function allocateSubscriptionCredits(
  userId: string,
  credits: number,
  planName: string,
  subscriptionId: string
) {
  return grantCredits(
    userId,
    credits,
    `Monthly credits — ${planName}`,
    TransactionType.SUBSCRIPTION_GRANT,
    subscriptionId
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getTransactionHistory(userId: string, limit = 20, offset = 0) {
  return prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function getTransactionCount(userId: string): Promise<number> {
  return prisma.creditTransaction.count({ where: { userId } });
}
