import { NextResponse, type NextRequest } from "next/server";

import { usableStripeKey } from "@/app/today/access";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!usableStripeKey()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const admin = createAdminClient();
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = subscription?.stripe_customer_id ?? null;
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id ?? null;
      if (customerId) {
        await admin.from("user_subscriptions").upsert(
          {
            user_id: user.id,
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      }
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer is linked to this account yet." },
        { status: 404 },
      );
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });
    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json({ error: "Billing portal is unavailable." }, { status: 503 });
  }
}
