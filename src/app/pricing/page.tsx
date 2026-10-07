import Link from "next/link";

import { PricingPlans } from "@/components/pricing/PricingPlans";
import { getSubscriptionAccess } from "@/utils/subscription";

import { loadPricingFactorSamples, type PricingFactorSample } from "./load";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing · EdgeBall",
  description: "Compare EdgeBall Free, Pro, and Premium subscriptions.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const [access, samples] = await Promise.all([
    getSubscriptionAccess(),
    loadPricingFactorSamples(),
  ]);
  const note = checkoutNote(params.checkout, params.plan, params.interval);
  const lead = samples[0] ?? null;
  const activeTier = access.status === "active" ? access.tier : null;

  return (
    <main
      className="min-h-[80vh] px-4 py-12 sm:px-6"
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 20% 0%, rgba(37,99,235,0.10), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(14,165,233,0.08), transparent 50%), #eef3f9",
      }}
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-center text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
          Pricing
        </p>
        <h1 className="mt-2 text-center text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
          Bet with stored edge — not vibes
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[#64748b] sm:text-base">
          Free covers the fixture board. Premium is a recurring subscription that unlocks
          factors, backtests, Poisson edges, player props, and deep match logs.
        </p>

        {note ? (
          <p className="mx-auto mt-4 max-w-lg rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#0f172a]">
            {note}
          </p>
        ) : null}

        {access.status === "active" ? (
          <p className="mx-auto mt-4 max-w-lg text-center text-sm font-semibold text-emerald-700">
            {access.tier
              ? `You are on EdgeBall ${access.tier === "premium" ? "Premium" : "Pro"}.`
              : "You are on an active EdgeBall plan."}
          </p>
        ) : null}

        {lead ? <LiveProofBanner sample={lead} samples={samples} /> : null}

        <PricingPlans
          subscribed={access.status === "active"}
          activeTier={activeTier}
          proof={lead ? proofSummary(lead) : null}
        />

        <p className="mt-8 text-center text-xs text-[#64748b]">
          Already subscribed?{" "}
          <Link href="/auth/login?next=/pricing" className="font-semibold text-[#2563eb]">
            Sign in
          </Link>{" "}
          to sync your membership.
        </p>
      </div>
    </main>
  );
}

function proofSummary(sample: PricingFactorSample) {
  return {
    badgeLabel: sample.badgeLabel,
    hitRatePct: sample.backtest.hitRatePct,
    marketLabel: sample.marketLabel,
    totalSamples: sample.backtest.totalSamples,
  };
}

function LiveProofBanner({
  sample,
  samples,
}: {
  sample: PricingFactorSample;
  samples: PricingFactorSample[];
}) {
  return (
    <section className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[#e2e8f0] bg-white/90 p-5 shadow-sm">
      <p className="text-center text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
        Live factor proof · from your database
      </p>
      <p className="mt-2 text-center text-lg font-bold text-[#0f172a]">
        {sample.badgeLabel} hit {sample.backtest.hitRatePct}% on{" "}
        {sample.marketLabel.toLowerCase()}
      </p>
      <p className="mt-1 text-center text-sm text-[#64748b]">
        {sample.backtest.hits}/{sample.backtest.totalSamples} finished fixtures
        {sample.backtest.flatRoiPct != null
          ? ` · flat ROI ${sample.backtest.flatRoiPct >= 0 ? "+" : ""}${sample.backtest.flatRoiPct}%`
          : ""}
        {" "}
        — not a static blog tip
      </p>
      {samples.length > 1 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {samples.slice(0, 3).map((row) => (
            <span
              key={row.factorId}
              className="rounded-full border border-[#e2e8f0] bg-[#eef3f9] px-3 py-1 text-xs font-semibold text-[#0f172a]"
            >
              {row.badgeLabel} {row.backtest.hitRatePct}% · n={row.backtest.totalSamples}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function checkoutNote(
  value: string | undefined,
  plan: string | undefined,
  interval: string | undefined,
) {
  switch (value) {
    case "success":
      return "Subscription started — access unlocks as soon as Stripe confirms the webhook.";
    case "cancelled":
      return "Checkout cancelled. No charge was made.";
    case "unconfigured":
      return "Stripe is not configured yet (missing STRIPE_SECRET_KEY).";
    case "price-unconfigured":
      return `Checkout needs ${priceEnvName(plan, interval)} before it can open.`;
    case "invalid":
      return "Choose a Pro or Premium monthly or annual subscription before checkout.";
    case "incomplete":
      return "Stripe did not confirm an active subscription for that checkout.";
    case "signin":
      return "Sign in before opening checkout.";
    case "unavailable":
      return "Checkout could not start. Try again in a moment.";
    default:
      return null;
  }
}

function priceEnvName(plan: string | undefined, interval: string | undefined) {
  if (plan === "premium") {
    return interval === "year"
      ? "STRIPE_PRICE_PREMIUM_YEARLY"
      : "STRIPE_PRICE_PREMIUM_MONTHLY";
  }
  return interval === "year" ? "STRIPE_PRICE_PRO_YEARLY" : "STRIPE_PRICE_PRO_MONTHLY";
}
