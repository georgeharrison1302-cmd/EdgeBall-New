import Link from "next/link";
import { redirect } from "next/navigation";

import { BillingPortalButton } from "@/components/billing/BillingPortalButton";
import { createClient } from "@/utils/supabase/server";
import type { SubscriptionTier } from "@/types/billing";
import {
  getSubscriptionAccess,
  subscriptionTierFromPriceId,
  type SubscriptionStatus,
} from "@/utils/subscription";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account · EdgeBall",
  description: "Manage your EdgeBall account and billing.",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/account");

  const [{ data: subscription }, access] = await Promise.all([
    supabase
      .from("user_subscriptions")
      .select("subscription_status, subscription_tier, price_id, stripe_subscription_id, current_period_end, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    getSubscriptionAccess(),
  ]);

  const status = (subscription?.subscription_status ?? null) as SubscriptionStatus | null;
  const tier =
    status === "active"
      ? normalizeTier(subscription?.subscription_tier) ??
        subscriptionTierFromPriceId(subscription?.price_id)
      : null;
  const isPaid = access.status === "active";
  const plan = isPaid
    ? tier === "premium"
      ? "EdgeBall Premium"
      : "EdgeBall Pro"
    : "Free";

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">Account</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#0f172a]">My Account</h1>
      <p className="mt-2 text-sm text-[#64748b]">
        Manage your sign-in details, membership, and Stripe billing.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">Profile</p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs font-semibold text-[#64748b]">Email</dt>
              <dd className="mt-1 break-all text-sm font-bold text-[#0f172a]">{user.email ?? "No email stored"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#64748b]">Auth providers</dt>
              <dd className="mt-1 text-sm font-semibold text-[#0f172a]">{providerLabel(user.app_metadata?.providers)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[#64748b]">Member since</dt>
              <dd className="mt-1 text-sm font-semibold text-[#0f172a]">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">Membership</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xl font-black text-[#0f172a]">{plan}</p>
            <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wide uppercase ${isPaid ? "bg-blue-50 text-[#2563eb]" : "bg-slate-100 text-[#64748b]"}`}>
              {isPaid ? "Active" : status ?? "Free"}
            </span>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">Tier</dt>
              <dd className="font-semibold text-[#0f172a]">{tierLabel(tier)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">Status</dt>
              <dd className="font-semibold text-[#0f172a]">{status ?? "None"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748b]">Renews</dt>
              <dd className="font-semibold text-[#0f172a]">
                {formatDate(subscription?.current_period_end)}
              </dd>
            </div>
          </dl>
          <div className="mt-6 space-y-3">
            <BillingPortalButton />
            <Link href="/pricing" className="block text-sm font-bold text-[#2563eb]">
              Compare plans
            </Link>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-3xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">Workspace</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/portfolio" className="rounded-full border border-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] hover:border-[#2563eb]">
            Portfolio
          </Link>
          <Link href="/" className="rounded-full border border-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] hover:border-[#2563eb]">
            Fixture centre
          </Link>
          <Link href="/pricing" className="rounded-full border border-[#e2e8f0] px-4 py-2 text-sm font-bold text-[#0f172a] hover:border-[#2563eb]">
            Upgrade options
          </Link>
        </div>
      </section>
    </main>
  );
}

function normalizeTier(value: unknown): SubscriptionTier | null {
  return value === "pro" || value === "premium" ? value : null;
}

function tierLabel(tier: SubscriptionTier | null) {
  if (tier === "premium") return "Premium";
  if (tier === "pro") return "Pro";
  return "None";
}

function providerLabel(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "Email";
  return value
    .filter((provider): provider is string => typeof provider === "string")
    .map((provider) => provider.charAt(0).toUpperCase() + provider.slice(1))
    .join(", ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}
