import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isStripeConfigured, createCreditCheckout } from "@/lib/billing/stripeService";

const requestSchema = z.object({ packSlug: z.string() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      mock: true,
      message: "Stripe is not configured. In production, this would redirect to a payment page.",
      url: null,
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const pack = await prisma.creditPack.findUnique({ where: { slug: parsed.data.packSlug } });
  if (!pack || !pack.isEnabled) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  if (!pack.stripePriceId) return NextResponse.json({ error: "Pack has no Stripe price configured" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutSession = await createCreditCheckout({
    userId: session.user.id,
    userEmail: user.email,
    priceId: pack.stripePriceId,
    successUrl: `${appUrl}/app/billing?success=1&pack=${pack.slug}`,
    cancelUrl: `${appUrl}/app/billing`,
    packId: pack.id,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
