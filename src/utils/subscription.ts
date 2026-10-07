import "server-only";

import { hasActiveSubscription, usableStripeKey } from "@/app/today/access";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type SubscriptionStatus = "active" | "inactive" | "past_due";

export type SubscriptionAccess = {
  unlocked: boolean;
  status: SubscriptionStatus | null;
  userId: string | null;
  signedIn: boolean;
};

/**
 * Resolve EdgeBall Pro access for the current session.
 * Prefers `user_subscriptions`, falls back to live Stripe customer check.
 */
export async function getSubscriptionAccess(): Promise<SubscriptionAccess> {
  if (process.env.SUBSCRIPTION_BYPASS === "1") {
    return { unlocked: true, status: "active", userId: null, signedIn: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unconfigured Stripe in local/dev: keep the product usable.
    if (!usableStripeKey()) {
      return { unlocked: true, status: null, userId: null, signedIn: false };
    }
    return { unlocked: false, status: null, userId: null, signedIn: false };
  }

  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const status = (row?.subscription_status as SubscriptionStatus | undefined) ?? null;
  if (status === "active") {
    return { unlocked: true, status, userId: user.id, signedIn: true };
  }

  // Legacy / cookie Stripe customers still unlock until webhook backfill lands.
  if (usableStripeKey()) {
    try {
      if (await hasActiveSubscription()) {
        return { unlocked: true, status: status ?? "active", userId: user.id, signedIn: true };
      }
    } catch {
      /* ignore Stripe outages */
    }
  } else {
    return { unlocked: true, status: status ?? "inactive", userId: user.id, signedIn: true };
  }

  return {
    unlocked: false,
    status: status ?? "inactive",
    userId: user.id,
    signedIn: true,
  };
}

export async function upsertSubscriptionByUserId(input: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status: SubscriptionStatus;
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
    priceId: input.priceId,
    currentPeriodEnd: input.currentPeriodEnd,
  });
}

export function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  return "inactive";
}
