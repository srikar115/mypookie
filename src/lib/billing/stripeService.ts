import type Stripe from "stripe";

/** Stripe integration — gracefully no-ops if keys are not configured */

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY?.trim());
}

// Lazy-load Stripe only when keys are available to avoid crashes in dev
let _stripe: Stripe | null = null;

async function getStripe(): Promise<Stripe> {
  if (!isStripeConfigured()) throw new Error("Stripe is not configured");
  if (!_stripe) {
    const StripeLib = (await import("stripe")).default;
    _stripe = new StripeLib(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
  }
  return _stripe;
}

export interface CreateSubscriptionCheckoutOptions {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createSubscriptionCheckout(options: CreateSubscriptionCheckoutOptions) {
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: options.userEmail,
    line_items: [{ price: options.priceId, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: { userId: options.userId, ...(options.metadata ?? {}) },
    subscription_data: { metadata: { userId: options.userId } },
  });
  return session;
}

export interface CreateCreditCheckoutOptions {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  packId: string;
}

export async function createCreditCheckout(options: CreateCreditCheckoutOptions) {
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: options.userEmail,
    line_items: [{ price: options.priceId, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: { userId: options.userId, packId: options.packId, type: "credit_pack" },
  });
  return session;
}

export async function constructWebhookEvent(body: string, signature: string): Promise<Stripe.Event> {
  const stripe = await getStripe();
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
