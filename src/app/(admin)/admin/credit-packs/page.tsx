import prisma from "@/lib/db";
import { AdminCreditPacksClient } from "./AdminCreditPacksClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Credit Packs" };

export default async function AdminCreditPacksPage() {
  const packs = await prisma.creditPack.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Credit Packs</h1>
        <p className="text-sm text-gray-400 mt-1">Manage pay-as-you-go credit packs</p>
      </div>
      <AdminCreditPacksClient packs={packs.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description ?? "",
        credits: p.credits,
        bonusCredits: p.bonusCredits,
        price: p.price,
        currency: p.currency,
        stripePriceId: p.stripePriceId ?? "",
        isEnabled: p.isEnabled,
        sortOrder: p.sortOrder,
      }))} />
    </div>
  );
}
