"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import type { BillingInterval, SubscriptionTier } from "@/types/billing";

type PricingProof = {
  badgeLabel: string;
  hitRatePct: number;
  marketLabel: string;
  totalSamples: number;
};

const FREE_FEATURES = [
  "Live Odds",
  "Basic Standings",
  "Match Hub",
  "Bet slip builder",
];

const PREMIUM_FEATURES = [
  "Poisson +Edge% Calculations",
  "Deep Last-5 Match Logs",
  "Smart Portfolio Tracking",
  "Fixture Factor Backtesting",
  "Player props and model tools",
  "Premium support",
];

const PREMIUM_PRICES: Record<BillingInterval, { price: string; period: string; note: string; founders: string }> = {
  month: {
    price: "£14.99",
    period: "/mo",
    note: "Billed monthly",
    founders: "Founders price: £10.49/mo with FOUNDERS30",
  },
  year: {
    price: "£179.88",
    period: "/yr",
    note: "Billed annually",
    founders: "Founders price: £125.92/yr with FOUNDERS30",
  },
};

export function PricingPlans({
  subscribed,
  activeTier,
  proof,
}: {
  subscribed: boolean;
  activeTier: SubscriptionTier | null;
  proof: PricingProof | null;
}) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <>
      <div className="mt-8 flex justify-center">
        <div
          aria-label="Billing interval"
          className="inline-flex rounded-full border border-[#e2e8f0] bg-white p-1 shadow-sm"
          role="group"
        >
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                interval === value
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#64748b] hover:text-[#0f172a]"
              }`}
            >
              {value === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-3xl gap-5 md:grid-cols-2">
        <TierCard
          eyebrow="Free"
          title="Match Hub"
          price="£0"
          period="/mo"
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
          eyebrow="Premium"
          title="EdgeBall Premium"
          price={PREMIUM_PRICES[interval].price}
          period={PREMIUM_PRICES[interval].period}
          badge="Recommended"
          note="Founders Club: First 50 members get 30% off for life with code FOUNDERS30"
          detail={`${PREMIUM_PRICES[interval].note} · ${PREMIUM_PRICES[interval].founders}`}
          features={PREMIUM_FEATURES}
          proof={proof}
          featured
          cta={
            <PaidTierCta
              interval={interval}
              subscribed={subscribed}
              activeTier={activeTier}
            />
          }
        />
      </div>
    </>
  );
}

function PaidTierCta({
  interval,
  subscribed,
  activeTier,
}: {
  interval: BillingInterval;
  subscribed: boolean;
  activeTier: SubscriptionTier | null;
}) {
  if (subscribed) {
    return (
      <Link
        href="/account"
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#0f172a] px-4 py-3 text-sm font-bold text-white hover:bg-[#1e293b]"
      >
        {activeTier === "premium" ? "Current plan" : "Manage subscription"}
      </Link>
    );
  }

  return (
    <form action="/api/checkout" method="post" className="mt-6">
      <input type="hidden" name="plan" value="premium" />
      <input type="hidden" name="interval" value={interval} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center rounded-full bg-[#0f172a] px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1e293b]"
      >
        Subscribe to Premium {interval === "month" ? "monthly" : "annually"}
      </button>
    </form>
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
  badge = null,
  note = null,
  detail = null,
}: {
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  features: string[];
  cta: ReactNode;
  featured?: boolean;
  proof?: PricingProof | null;
  badge?: string | null;
  note?: string | null;
  detail?: string | null;
}) {
  return (
    <section
      className={`rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${
        featured ? "border-[#2563eb] ring-2 ring-[#2563eb]/15" : "border-[#e2e8f0]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
          {eyebrow}
        </p>
        {badge ? (
          <span className="rounded-full bg-[#2563eb] px-3 py-1 text-[10px] font-extrabold tracking-wide text-white uppercase">
            {badge}
          </span>
        ) : null}
      </div>
      <h2 className="mt-1 text-xl font-bold text-[#0f172a]">{title}</h2>
      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-black tracking-tight text-[#0f172a]">{price}</span>
        <span className="text-sm font-semibold text-[#64748b]">{period}</span>
      </p>
      {note ? (
        <p className="mt-3 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1.5 text-center text-xs font-extrabold text-[#1d4ed8]">
          {note}
        </p>
      ) : null}
      {detail ? (
        <p className="mt-2 text-center text-xs font-semibold text-[#64748b]">{detail}</p>
      ) : null}
      {proof ? (
        <div className="mt-4 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3.5 py-3">
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Included · live backtest
          </p>
          <p className="mt-1 text-sm font-bold text-[#0f172a]">
            {proof.badgeLabel}: {proof.hitRatePct}% hit rate
          </p>
          <p className="mt-0.5 text-xs text-[#64748b]">
            vs {proof.marketLabel} · {proof.totalSamples} historical fixtures
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
