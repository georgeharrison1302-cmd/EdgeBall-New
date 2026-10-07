import { NextResponse, type NextRequest } from "next/server";

import { usableStripeKey } from "@/app/today/access";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

export const dynamic = "force-dynamic";

type CheckoutPlan = "pro" | "founders";

export async function POST(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan") === "founders" ? "founders" : "pro";
  const pricing = new URL("/pricing", request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const price = priceIdForPlan(plan);
  if (!price) {
    pricing.searchParams.set("checkout", plan === "founders" ? "founders-unconfigured" : "unconfigured");
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

    const session = await stripe.checkout.sessions.create({
      mode: plan === "founders" ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/api/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, edgeball_plan: plan },
      ...(plan === "founders"
        ? {
            payment_intent_data: {
              metadata: { supabase_user_id: user.id, edgeball_plan: plan },
            },
          }
        : {
            subscription_data: {
              metadata: { supabase_user_id: user.id, edgeball_plan: plan },
            },
          }),
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

function priceIdForPlan(plan: CheckoutPlan) {
  return plan === "founders"
    ? process.env.STRIPE_FOUNDERS_PRICE_ID
    : process.env.STRIPE_PRICE_ID;
}
