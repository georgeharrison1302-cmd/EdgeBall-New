import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/utils/stripe";

import type { TodayBoard } from "./load";
import { MARKET_FILTERS, propsForFilter } from "./markets";

const CUSTOMER_COOKIE = "eb_customer";
const PREVIEW_ROWS = 2;

export function restrictBoard(board: TodayBoard, unlocked: boolean): TodayBoard {
  if (unlocked) return board;
  return {
    ...board,
    fixtures: board.fixtures.map((item) => ({
      ...item,
      propsLocked: MARKET_FILTERS.some((filter) => propsForFilter(item.props, filter.id).length > PREVIEW_ROWS),
      headToHeadLocked: item.headToHead.length > PREVIEW_ROWS,
      props: MARKET_FILTERS.flatMap((filter) => propsForFilter(item.props, filter.id).slice(0, PREVIEW_ROWS)),
      headToHead: item.headToHead.slice(0, PREVIEW_ROWS),
    })),
  };
}

export async function hasActiveSubscription() {
  if (!usableStripeKey()) return false;
  try {
    const customerIds = await customerIdsForSession();
    for (const customerId of customerIds) {
      if (await subscriptionIsActive(customerId)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function customerCookieOptions(customerId: string) {
  return {
    name: CUSTOMER_COOKIE,
    value: customerId,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export function usableStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_") || key.startsWith("rk_");
}

async function customerIdsForSession() {
  const ids = new Set<string>();
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(CUSTOMER_COOKIE)?.value ?? "";
  if (/^cus_[A-Za-z0-9]+$/.test(fromCookie)) ids.add(fromCookie);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (email) {
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email, limit: 1 });
    for (const customer of customers.data) ids.add(customer.id);
  }
  return [...ids];
}

async function subscriptionIsActive(customerId: string) {
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  return subscriptions.data.length > 0;
}
