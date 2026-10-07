import "server-only";

import { hasActiveSubscription, usableStripeKey } from "@/app/today/access";
import type { BillingInterval, SubscriptionTier } from "@/types/billing";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type SubscriptionStatus = "active" | "inactive" | "past_due";

export type SubscriptionAccess = {
  unlocked: boolean;
  status: SubscriptionStatus | null;
  tier: SubscriptionTier | null;
  userId: string | null;
  signedIn: boolean;
};

/**
 * Resolve EdgeBall Pro access for the current session.
 * Prefers `user_subscriptions`, falls back to live Stripe customer check.
 */
export async function getSubscriptionAccess(): Promise<SubscriptionAccess> {
  if (process.env.SUBSCRIPTION_BYPASS === "1") {
    return { unlocked: true, status: "active", tier: null, userId: null, signedIn: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unconfigured Stripe in local/dev: keep the product usable.
    if (!usableStripeKey()) {
      return { unlocked: true, status: null, tier: null, userId: null, signedIn: false };
    }
    return { unlocked: false, status: null, tier: null, userId: null, signedIn: false };
  }

  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("subscription_status, subscription_tier, price_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const status = (row?.subscription_status as SubscriptionStatus | undefined) ?? null;
  const tier =
    normalizeSubscriptionTier(row?.subscription_tier) ??
    subscriptionTierFromPriceId(row?.price_id);
  if (status === "active") {
    return { unlocked: true, status, tier, userId: user.id, signedIn: true };
  }

  // Legacy / cookie Stripe customers still unlock until webhook backfill lands.
  if (usableStripeKey()) {
    try {
      if (await hasActiveSubscription()) {
        return {
          unlocked: true,
          status: status ?? "active",
          tier,
          userId: user.id,
          signedIn: true,
        };
      }
    } catch {
      /* ignore Stripe outages */
    }
  } else {
    return {
      unlocked: true,
      status: status ?? "inactive",
      tier,
      userId: user.id,
      signedIn: true,
    };
  }

  return {
    unlocked: false,
    status: status ?? "inactive",
    tier,
    userId: user.id,
    signedIn: true,
  };
}

export async function upsertSubscriptionByUserId(input: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status: SubscriptionStatus;
  tier?: SubscriptionTier | null;
  priceId?: string | null;
  currentPeriodEnd?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: input.userId,
      stripe_customer_id: input.stripeCustomerId ?? undefined,
      stripe_subscription_id: input.stripeSubscriptionId ?? undefined,
      subscription_status: input.status,
      subscription_tier: input.tier ?? undefined,
      price_id: input.priceId ?? undefined,
      current_period_end: input.currentPeriodEnd ?? undefined,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function upsertSubscriptionByCustomerId(input: {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  status: SubscriptionStatus;
  tier?: SubscriptionTier | null;
  priceId?: string | null;
  currentPeriodEnd?: string | null;
  userId?: string | null;
}) {
  const admin = createAdminClient();

  if (input.userId) {
    await upsertSubscriptionByUserId({
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      status: input.status,
      tier: input.tier,
      priceId: input.priceId,
      currentPeriodEnd: input.currentPeriodEnd,
    });
    return;
  }

  const { data: existing } = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", input.stripeCustomerId)
    .maybeSingle();

  if (!existing?.user_id) {
    console.warn(
      `stripe webhook: no user_subscriptions row for customer ${input.stripeCustomerId}`,
    );
    return;
  }

  await upsertSubscriptionByUserId({
    userId: existing.user_id,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
    tier: input.tier,
    priceId: input.priceId,
    currentPeriodEnd: input.currentPeriodEnd,
  });
}

export function checkoutPriceId(
  plan: SubscriptionTier,
  interval: BillingInterval,
): string | undefined {
  if (plan === "pro") {
    return interval === "month"
      ? process.env.STRIPE_PRICE_PRO_MONTHLY
      : process.env.STRIPE_PRICE_PRO_YEARLY;
  }
  return interval === "month"
    ? process.env.STRIPE_PRICE_PREMIUM_MONTHLY
    : process.env.STRIPE_PRICE_PREMIUM_YEARLY;
}

export function subscriptionTierFromPriceId(
  priceId: string | null | undefined,
): SubscriptionTier | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_YEARLY
  ) {
    return "pro";
  }
  if (
    priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PREMIUM_YEARLY
  ) {
    return "premium";
  }
  return null;
}

function normalizeSubscriptionTier(value: unknown): SubscriptionTier | null {
  return value === "pro" || value === "premium" ? value : null;
}

export function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  return "inactive";
}
