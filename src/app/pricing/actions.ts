"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { usableStripeKey } from "@/app/today/access";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

/**
 * Create a Stripe Checkout Session for EdgeBall Pro and redirect.
 */
export async function startProCheckout() {
  if (!usableStripeKey()) {
    redirect("/pricing?checkout=unconfigured");
  }
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    redirect("/pricing?checkout=unconfigured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect("/auth/login?next=/pricing");
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
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("user_subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        subscription_status: "inactive",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : null);
  if (!origin) throw new Error("Cannot resolve site origin — set NEXT_PUBLIC_SITE_URL");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  });

  if (!session.url) {
    redirect("/pricing?checkout=unavailable");
  }
  redirect(session.url);
}
