import { NextResponse, type NextRequest } from "next/server";

import { usableStripeKey } from "@/app/today/access";
import type { BillingInterval, SubscriptionTier } from "@/types/billing";
import { checkoutPriceId } from "@/utils/subscription";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

export const dynamic = "force-dynamic";

type CheckoutInput = {
  plan: SubscriptionTier;
  interval: BillingInterval;
};

export async function POST(request: NextRequest) {
  const pricing = new URL("/pricing", request.url);
  const input = await checkoutInput(request);
  if (!input) {
    pricing.searchParams.set("checkout", "invalid");
    return NextResponse.redirect(pricing, 303);
  }

  const price = checkoutPriceId(input.plan, input.interval);
  if (!price) {
    pricing.searchParams.set("checkout", "price-unconfigured");
    pricing.searchParams.set("plan", input.plan);
    pricing.searchParams.set("interval", input.interval);
    return NextResponse.redirect(pricing, 303);
  }

  if (!usableStripeKey()) {
    pricing.searchParams.set("checkout", "unconfigured");
    return NextResponse.redirect(pricing, 303);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login?next=/pricing", request.url), 303);
    }

    const stripe = getStripe();
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("user_subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    const metadata = {
      supabase_user_id: user.id,
      edgeball_plan: input.plan,
      billing_interval: input.interval,
    };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/api/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata },
    });
    if (!session.url) {
      pricing.searchParams.set("checkout", "unavailable");
      return NextResponse.redirect(pricing, 303);
    }
    return NextResponse.redirect(session.url, 303);
  } catch {
    pricing.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(pricing, 303);
  }
}

async function checkoutInput(request: NextRequest): Promise<CheckoutInput | null> {
  let plan: unknown = request.nextUrl.searchParams.get("plan");
  let interval: unknown = request.nextUrl.searchParams.get("interval");
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { plan?: unknown; interval?: unknown }
      | null;
    plan = body?.plan ?? plan;
    interval = body?.interval ?? interval;
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    plan = form?.get("plan") ?? plan;
    interval = form?.get("interval") ?? interval;
  }

  const normalizedPlan = normalizePlan(plan);
  const normalizedInterval = normalizeInterval(interval);
  if (!normalizedPlan || !normalizedInterval) return null;
  return { plan: normalizedPlan, interval: normalizedInterval };
}

function normalizePlan(value: unknown): SubscriptionTier | null {
  return value === "pro" || value === "premium" ? value : null;
}

function normalizeInterval(value: unknown): BillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}
