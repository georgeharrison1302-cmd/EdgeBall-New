import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { customerCookieOptions, usableStripeKey } from "@/app/today/access";
import { getStripe } from "@/utils/stripe";

export async function GET(request: NextRequest) {
  const pricing = new URL("/pricing", request.url);
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  if (!usableStripeKey() || !sessionId.startsWith("cs_")) {
    pricing.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(pricing);
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (
      session.mode !== "subscription" ||
      session.status !== "complete" ||
      !customerId ||
      !subscriptionId
    ) {
      pricing.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(pricing);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      pricing.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(pricing);
    }

    const cookie = await customerCookieOptions(customerId);
    const cookieStore = await cookies();
    cookieStore.set(cookie.name, cookie.value, cookie.options);
    pricing.searchParams.set("checkout", "success");
    if (session.metadata?.edgeball_plan === "premium") {
      pricing.searchParams.set("plan", "premium");
    }
    return NextResponse.redirect(pricing);
  } catch {
    pricing.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(pricing);
  }
}
