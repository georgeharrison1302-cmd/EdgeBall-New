import Link from "next/link";
import type { ReactNode } from "react";

import { getSubscriptionAccess } from "@/utils/subscription";

import { startProCheckout } from "./actions";
import { loadPricingFactorSamples, type PricingFactorSample } from "./load";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing · EdgeBall",
  description: "EdgeBall Free vs EdgeBall Pro monthly subscription.",
};

const FREE_FEATURES = [
  "Live Odds",
  "Basic Standings",
  "Match Hub",
  "Bet slip builder",
];

const PRO_FEATURES = [
  "Poisson +Edge% Calculations",
  "Deep Last-5 Match Logs",
  "Smart Portfolio Tracking",
  "Fixture Factor Backtesting",
  "Tale of the Tape leaders",
  "Model accuracy tracker",
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const [access, samples] = await Promise.all([
    getSubscriptionAccess(),
    loadPricingFactorSamples(),
  ]);
  const note = checkoutNote(params.checkout);
  const lead = samples[0] ?? null;

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
          Free covers the Match Hub board. Pro unlocks factors, backtests, Poisson edges, and
          deep match logs.
        </p>

        {note ? (
          <p className="mx-auto mt-4 max-w-lg rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#0f172a]">
            {note}
          </p>
        ) : null}

        {access.unlocked ? (
          <p className="mx-auto mt-4 max-w-lg text-center text-sm font-semibold text-emerald-700">
            You are on EdgeBall Pro.
          </p>
        ) : null}

        {lead ? <LiveProofBanner sample={lead} samples={samples} /> : null}

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <TierCard
            eyebrow="Free"
            title="Match Hub"
            price="£0"
            period="/month"
            features={FREE_FEATURES}
            cta={
              <Link
                href="/"
                className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-[#e2e8f0] bg-white px-4 py-3 text-sm font-bold text-[#0f172a] hover:border-[#2563eb]"
              >
                Open Match Hub
              </Link>
            }
          />

          <TierCard
            eyebrow="Pro"
            title="EdgeBall Pro"
            price="£19"
            period="/month"
            featured
            features={PRO_FEATURES}
            proof={lead}
            cta={
              access.unlocked ? (
                <Link
                  href="/"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#2563eb] px-4 py-3 text-sm font-bold text-white hover:bg-[#1d4ed8]"
                >
                  Open Match Hub
                </Link>
              ) : (
                <form action={startProCheckout} className="mt-6">
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-full bg-[#2563eb] px-4 py-3 text-sm font-bold text-white shadow-sm shadow-blue-600/20 hover:bg-[#1d4ed8]"
                  >
                    Subscribe to Pro
                  </button>
                </form>
              )
            }
          />
        </div>

        <p className="mt-8 text-center text-xs text-[#64748b]">
          Already subscribed?{" "}
          <Link href="/auth/login?next=/pricing" className="font-semibold text-[#2563eb]">
            Sign in
          </Link>{" "}
          to sync your Pro status.
        </p>
      </div>
    </main>
  );
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

function TierCard({
  eyebrow,
  title,
  price,
  period,
  features,
  cta,
  featured = false,
  proof = null,
}: {
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  features: string[];
  cta: ReactNode;
  featured?: boolean;
  proof?: PricingFactorSample | null;
}) {
  return (
    <section
      className={`rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${
        featured ? "border-[#2563eb] ring-2 ring-[#2563eb]/15" : "border-[#e2e8f0]"
      }`}
    >
      <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-bold text-[#0f172a]">{title}</h2>
      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-black tracking-tight text-[#0f172a]">{price}</span>
        <span className="text-sm font-semibold text-[#64748b]">{period}</span>
      </p>
      {proof ? (
        <div className="mt-4 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3">
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Included · live backtest
          </p>
          <p className="mt-1 text-sm font-bold text-[#0f172a]">
            {proof.badgeLabel}: {proof.backtest.hitRatePct}% hit rate
          </p>
          <p className="mt-0.5 text-xs text-[#64748b]">
            vs {proof.marketLabel} · {proof.backtest.totalSamples} historical fixtures
          </p>
        </div>
      ) : null}
      <ul className="mt-6 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-[#334155]">
            <span className="mt-0.5 font-bold text-[#2563eb]" aria-hidden>
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {cta}
    </section>
  );
}

function checkoutNote(value: string | undefined) {
  switch (value) {
    case "success":
      return "Payment received — Pro unlocks as soon as Stripe confirms the webhook.";
    case "cancelled":
      return "Checkout cancelled. No charge was made.";
    case "unconfigured":
      return "Stripe is not configured yet (missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID).";
    case "unavailable":
      return "Checkout could not start. Try again in a moment.";
    default:
      return null;
  }
}
