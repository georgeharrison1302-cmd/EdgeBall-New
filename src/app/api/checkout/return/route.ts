import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { customerCookieOptions, usableStripeKey } from "@/app/today/access";
import { getStripe } from "@/utils/stripe";

export async function GET(request: NextRequest) {
  const today = new URL("/today", request.url);
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  if (!usableStripeKey() || !sessionId.startsWith("cs_")) {
    today.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(today);
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (session.status !== "complete" || !customerId) {
      today.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(today);
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    if (subscriptions.data.length === 0) {
      today.searchParams.set("checkout", "incomplete");
      return NextResponse.redirect(today);
    }
    const cookie = await customerCookieOptions(customerId);
    const cookieStore = await cookies();
    cookieStore.set(cookie.name, cookie.value, cookie.options);
    return NextResponse.redirect(today);
  } catch {
    today.searchParams.set("checkout", "unavailable");
    return NextResponse.redirect(today);
  }
}
