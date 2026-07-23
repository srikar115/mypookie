import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { isStripeConfigured, constructWebhookEvent } from "@/lib/billing/stripeService";
import { grantCredits, allocateSubscriptionCredits } from "@/lib/billing/creditService";
import { TransactionType, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(body, signature);
  } catch (err) {
    console.error("[webhook/stripe] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[webhook/stripe] error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  // Credit pack purchase
  if (session.metadata?.type === "credit_pack") {
    const packId = session.metadata.packId;
    const pack = await prisma.creditPack.findUnique({ where: { id: packId } });
    if (pack) {
      await grantCredits(
        userId,
        pack.credits + pack.bonusCredits,
        `Credit pack — ${pack.name}`,
        TransactionType.CREDIT_PURCHASE,
        session.id
      );
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const rawSub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id;
  if (!subscriptionId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { plan: true, user: true },
  });
  if (!sub) return;

  // Allocate monthly credits
  if (sub.plan.monthlyCredits > 0) {
    await allocateSubscriptionCredits(
      sub.userId,
      sub.plan.monthlyCredits,
      sub.plan.name,
      sub.id
    );
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: invoice.lines?.data?.[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000)
        : undefined,
    },
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const rawSub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id;
  if (!subscriptionId) return;
  const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
  if (!existing) return;
  await prisma.subscription.update({ where: { id: existing.id }, data: { status: SubscriptionStatus.PAST_DUE } });
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const planStripePriceId = subscription.items.data[0]?.price?.id;
  const plan = await prisma.plan.findFirst({
    where: {
      OR: [
        { stripePriceIdMonthly: planStripePriceId },
        { stripePriceIdYearly: planStripePriceId },
      ],
    },
  });
  if (!plan) return;

  // Use `as any` for period fields — they exist at runtime but may differ by API version
  const sub = subscription as unknown as {
    current_period_start: number;
    current_period_end: number;
    status: string;
    id: string;
    items: { data: Array<{ price: { id: string } }> };
    metadata: Record<string, string>;
  };

  const status = mapStripeStatus(sub.status);
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    update: {
      status,
      planId: plan.id,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
    create: {
      userId,
      planId: plan.id,
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existing = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscription.id } });
  if (!existing) return;
  await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
  });
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active": return SubscriptionStatus.ACTIVE;
    case "canceled": return SubscriptionStatus.CANCELED;
    case "past_due": return SubscriptionStatus.PAST_DUE;
    case "trialing": return SubscriptionStatus.TRIALING;
    default: return SubscriptionStatus.INCOMPLETE;
  }
}
