import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isStripeConfigured, createSubscriptionCheckout } from "@/lib/billing/stripeService";

const requestSchema = z.object({
  planSlug: z.string(),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

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
  const { planSlug, interval } = parsed.data;

  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || !plan.isActive) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const priceId = interval === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) return NextResponse.json({ error: "Plan has no Stripe price configured" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutSession = await createSubscriptionCheckout({
    userId: session.user.id,
    userEmail: user.email,
    priceId,
    successUrl: `${appUrl}/app/billing?success=1&plan=${planSlug}`,
    cancelUrl: `${appUrl}/app/billing`,
    metadata: { planSlug, interval },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
