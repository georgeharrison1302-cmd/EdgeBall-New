import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import {
  mapStripeStatus,
  upsertSubscriptionByCustomerId,
  upsertSubscriptionByUserId,
} from "@/utils/subscription";
import { getStripe } from "@/utils/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — updates `user_subscriptions` on checkout + subscription lifecycle.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(stripe, session);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      default:
        break;
    }
  } catch (cause) {
    console.error("stripe webhook handler failed", cause);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  stripe: ReturnType<typeof getStripe>,
  session: Stripe.Checkout.Session,
) {
  const userId =
    session.client_reference_id ??
    session.metadata?.supabase_user_id ??
    null;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  if (!customerId) return;

  let subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let status = mapStripeStatus(session.status === "complete" ? "active" : null);
  let priceId: string | null = null;
  let periodEnd: string | null = null;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    status = mapStripeStatus(subscription.status);
    priceId = subscription.items.data[0]?.price.id ?? null;
    periodEnd = periodEndIso(subscription);
  }

  if (userId) {
    await upsertSubscriptionByUserId({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: status === "inactive" && session.payment_status === "paid" ? "active" : status,
      priceId,
      currentPeriodEnd: periodEnd,
    });
    return;
  }

  await upsertSubscriptionByCustomerId({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status: status === "inactive" && session.payment_status === "paid" ? "active" : status,
    priceId,
    currentPeriodEnd: periodEnd,
  });
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const userId = subscription.metadata?.supabase_user_id ?? null;
  const status = mapStripeStatus(subscription.status);
  const priceId = subscription.items.data[0]?.price.id ?? null;

  await upsertSubscriptionByCustomerId({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status,
    priceId,
    currentPeriodEnd: periodEndIso(subscription),
  });
}

function periodEndIso(subscription: Stripe.Subscription): string | null {
  const raw = (subscription as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  if (raw == null || !Number.isFinite(raw)) return null;
  return new Date(raw * 1000).toISOString();
}
