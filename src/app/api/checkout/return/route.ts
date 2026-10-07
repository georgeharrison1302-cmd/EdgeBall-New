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
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (session.status !== "complete" || !customerId) {
      pricing.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(pricing);
    }

    if (session.mode === "payment") {
      if (session.payment_status !== "paid") {
        pricing.searchParams.set("checkout", "incomplete");
        return NextResponse.redirect(pricing);
      }
      const cookie = await customerCookieOptions(customerId);
      const cookieStore = await cookies();
      cookieStore.set(cookie.name, cookie.value, cookie.options);
      pricing.searchParams.set("checkout", "success");
      pricing.searchParams.set("plan", "founders");
      return NextResponse.redirect(pricing);
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    if (subscriptions.data.length === 0) {
      pricing.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(pricing);
    }
    const cookie = await customerCookieOptions(customerId);
    const cookieStore = await cookies();
    cookieStore.set(cookie.name, cookie.value, cookie.options);
    pricing.searchParams.set("checkout", "success");
    return NextResponse.redirect(pricing);
  } catch {
    pricing.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(pricing);
  }
}
