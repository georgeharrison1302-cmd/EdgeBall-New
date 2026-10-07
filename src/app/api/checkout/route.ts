import { NextResponse, type NextRequest } from "next/server";

import { usableStripeKey } from "@/app/today/access";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

export async function POST(request: NextRequest) {
  const today = new URL("/today", request.url);
  if (!usableStripeKey()) {
    today.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(today, 303);
  }
  const price = process.env.STRIPE_PRICE_ID;
  if (!price) {
    today.searchParams.set("checkout", "unconfigured");
    return NextResponse.redirect(today, 303);
  }

  try {
    const stripe = getStripe();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      today.searchParams.set("checkout", "signin");
      return NextResponse.redirect(today, 303);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: new URL("/api/checkout/return?session_id={CHECKOUT_SESSION_ID}", request.url).toString(),
      cancel_url: today.toString(),
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });
    if (!session.url) {
      today.searchParams.set("checkout", "unavailable");
      return NextResponse.redirect(today, 303);
    }
    return NextResponse.redirect(session.url, 303);
  } catch {
    today.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(today, 303);
  }
}
