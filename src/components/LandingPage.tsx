"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import BrandMark from "@/components/BrandMark";
import { OddsText } from "@/components/display/OddsText";

// Marketing page. Slip legs are stored Odds-API.io / API-Football rows.

const FOUNDER_CAP = 50;
const FOUNDER_LIVE = true;

const PRO_MONTHLY = 8.99;
const PREMIUM_MONTHLY = 14.99;
const FOUNDER_OFF = 0.3;
const ANNUAL_OFF = 0.1;

export type LandingLeg = {
  match: string;
  player: string;
  bet: string;
  odds: number;
  hitRate: string;
  edge: string;
};

const targetOddsOptions = ["3.0", "5.0", "8.0", "12.0"];
const marketOptions = [
  "Prop Trebles",
  "Match Accumulators",
  "Player Shots",
  "BTTS + Goals",
];
const riskOptions = ["Safe", "Balanced", "Aggressive"];

function money(value: number) {
  return `£${value.toFixed(2)}`;
}

function paidQuote(monthly: number) {
  const yearList = monthly * 12;
  if (FOUNDER_LIVE) {
    return {
      monthly: {
        list: money(monthly),
        now: money(monthly * (1 - FOUNDER_OFF)),
        suffix: "/mo",
      },
      annual: {
        list: money(yearList),
        now: money(yearList * (1 - FOUNDER_OFF)),
        suffix: "/yr",
      },
    };
  }
  return {
    monthly: { list: null, now: money(monthly), suffix: "/mo" },
    annual: {
      list: money(yearList),
      now: money(yearList * (1 - ANNUAL_OFF)),
      suffix: "/yr",
    },
  };
}

function shufflePick(pool: LandingLeg[], count: number) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

const plans = {
  free: {
    name: "Free",
    blurb: "Basic match props only. No daily spins.",
    features: ["Match Props", "Today's Fixtures"],
  },
  pro: {
    name: "Pro",
    blurb: "Build slips from ranked player and match markets.",
    features: ["Player Props", "Match Props", "Hit-rate & edge sort"],
    quote: paidQuote(PRO_MONTHLY),
    founderCta: "Claim Pro Founder Rate",
    cta: "Get Pro",
  },
  premium: {
    name: "Premium",
    blurb: "Unlimited Auto-Generator plus the full EdgeBall desk.",
    features: [
      "Unlimited Auto-Generator",
      "Hit Rate & Algorithmic Edge",
      "Live Injury Adjustments",
    ],
    quote: paidQuote(PREMIUM_MONTHLY),
    founderCta: "Claim Premium Founder Rate",
    cta: "Get Premium",
  },
} as const;

export default function LandingPage({ legs }: { legs: LandingLeg[] }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [freeSpins, setFreeSpins] = useState(1);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [slip, setSlip] = useState<LandingLeg[] | null>(null);
  const [targetOdds, setTargetOdds] = useState("5.0");
  const [market, setMarket] = useState("Prop Trebles");
  const [risk, setRisk] = useState("Safe");
  const pricingRef = useRef<HTMLElement>(null);

  const locked = freeSpins === 0;
  const sneakTotal = (slip ?? []).reduce(
    (product, leg) => product * leg.odds,
    1,
  );
  function generate() {
    if (freeSpins === 0) {
      pricingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    setSlip(legs.length === 0 ? [] : shufflePick(legs, Math.min(3, legs.length)));
    setHasGenerated(true);
    setFreeSpins(0);
  }

  return (
    <div className="bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-3xl px-4 pt-16 pb-8 text-center sm:px-6">
        <p className="text-xs font-bold uppercase tracking-wider">
          <BrandMark className="text-xs font-bold uppercase tracking-wider" />
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Stop Guessing. Know the Game.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-gray-500 sm:text-base">
          One free algorithmic slip. See the picks. Premium keeps the hit rates
          and edge.
        </p>
      </section>

      <section className="mx-auto mb-16 max-w-2xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Auto-generator
              </p>
              <p className="text-sm font-semibold text-slate-900">
                1 free algorithmic slip
              </p>
            </div>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {freeSpins} free use
            </span>
          </div>

          <div
            className={`grid gap-3 px-5 py-4 sm:grid-cols-3 ${locked ? "pointer-events-none opacity-50" : ""}`}
          >
            <label className="block text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Target Odds
              </span>
              <select
                value={targetOdds}
                disabled={locked}
                onChange={(event) => setTargetOdds(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {targetOddsOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Market
              </span>
              <select
                value={market}
                disabled={locked}
                onChange={(event) => setMarket(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {marketOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Risk Level
              </span>
              <select
                value={risk}
                disabled={locked}
                onChange={(event) => setRisk(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {riskOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="px-5 pb-4">
            <button
              type="button"
              onClick={generate}
              className={`w-full rounded-xl py-4 text-base font-bold text-white ${
                locked
                  ? "bg-slate-900 hover:bg-slate-800"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {locked
                ? "Unlock Unlimited Generator (Premium)"
                : "Generate Algorithmic Slip (1 Free Use)"}
            </button>
          </div>

          {hasGenerated && slip ? (
            <div className="border-t border-gray-100 px-5 py-4">
              {slip.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  No stored pre-match props to generate from.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-gray-100">
                    {slip.map((leg) => (
                      <li
                        key={`${leg.player}-${leg.bet}`}
                        className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_160px]"
                      >
                        <div className="min-w-0 text-left">
                          <p className="text-sm font-semibold text-slate-900">
                            {leg.bet}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {leg.player} · {leg.match}
                          </p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-blue-600">
                            <OddsText decimal={leg.odds} prefix="" />
                          </p>
                        </div>
                        <LockedMetric hitRate={leg.hitRate} edge={leg.edge} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t border-gray-100 pt-3 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Total odds
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-blue-600">
                      <OddsText decimal={sneakTotal} prefix="" />
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section ref={pricingRef} className="px-4 pb-20 sm:px-6">
        {FOUNDER_LIVE ? (
          <div className="mx-auto mb-8 flex max-w-3xl flex-col items-center rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
            <p className="text-center text-sm font-bold tracking-wide">
              🎉 FOUNDER&apos;S CLUB: 30% OFF FOR LIFE (First 50 Users Only)
            </p>
            <p className="mt-2 text-xs font-medium text-blue-700">
              First {FOUNDER_CAP} members
            </p>
          </div>
        ) : null}

        <div className="mb-10 flex items-center justify-center gap-3 text-sm font-medium">
          <span className={isAnnual ? "text-gray-400" : "text-slate-900"}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isAnnual}
            aria-label="Billing period"
            onClick={() => setIsAnnual((value) => !value)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isAnnual ? "bg-blue-600" : "bg-gray-200"}`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${isAnnual ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
          <span className={isAnnual ? "text-slate-900" : "text-gray-400"}>
            Annually
          </span>
          {!FOUNDER_LIVE ? (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Save 10%
            </span>
          ) : (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              30% off for life
            </span>
          )}
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-8 md:grid-cols-3 md:py-4">
          <PriceCard
            name={plans.free.name}
            blurb={plans.free.blurb}
            features={plans.free.features}
            price={
              <span className="text-3xl font-bold tracking-tight">£0</span>
            }
            cta="Start free"
            href="/fixtures"
          />
          <PriceCard
            name={plans.pro.name}
            blurb={plans.pro.blurb}
            features={plans.pro.features}
            price={
              <PlanPrice
                quote={
                  isAnnual ? plans.pro.quote.annual : plans.pro.quote.monthly
                }
              />
            }
            cta={FOUNDER_LIVE ? plans.pro.founderCta : plans.pro.cta}
            href="/login"
            className="border-gray-300"
          />
          <PriceCard
            name={plans.premium.name}
            blurb={plans.premium.blurb}
            features={plans.premium.features}
            price={
              <PlanPrice
                quote={
                  isAnnual
                    ? plans.premium.quote.annual
                    : plans.premium.quote.monthly
                }
              />
            }
            cta={FOUNDER_LIVE ? plans.premium.founderCta : plans.premium.cta}
            href="/login"
            popular
            className="relative scale-105 border-2 border-blue-600 shadow-xl"
            solidCta
          />
        </div>
      </section>
    </div>
  );
}

function LockedMetric({
  hitRate,
  edge,
  label,
  value,
  wide = false,
}: {
  hitRate?: string;
  edge?: string;
  label?: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={`relative ${wide ? "min-w-[160px]" : ""}`}>
      <div className="select-none blur-md">
        {hitRate && edge ? (
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-900">
              {hitRate} hit
            </p>
            <p className="text-xs font-semibold text-blue-600">{edge} edge</p>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {label}
            </p>
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {value}
            </p>
          </div>
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-900 shadow-sm">
          <LockIcon />
          Premium Edge Hidden
        </span>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4 5.5V4a2 2 0 1 1 4 0v1.5M3 5.5h6V10H3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function PlanPrice({
  quote,
}: {
  quote: { list: string | null; now: string; suffix: string };
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      {quote.list ? (
        <span className="text-base text-gray-400 line-through decoration-gray-400">
          {quote.list}
        </span>
      ) : null}
      <span className="text-3xl font-bold tracking-tight text-slate-900">
        {quote.now}
      </span>
      <span className="text-sm font-medium text-gray-500">{quote.suffix}</span>
    </span>
  );
}

function PriceCard({
  name,
  blurb,
  features,
  price,
  cta,
  href,
  popular,
  solidCta,
  className = "",
}: {
  name: string;
  blurb: string;
  features: readonly string[];
  price: React.ReactNode;
  cta: string;
  href: string;
  popular?: boolean;
  solidCta?: boolean;
  className?: string;
}) {
  return (
    <article
      className={`flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      {popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-bold tracking-wider text-white uppercase">
          Most popular
        </span>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
        {name}
      </p>
      <div className="mt-3">{price}</div>
      <p className="mt-2 text-sm text-gray-500">{blurb}</p>
      <ul className="mt-5 flex-1 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2 text-sm text-slate-700"
          >
            <span aria-hidden="true" className="mt-0.5 font-bold text-blue-600">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
          solidCta
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-gray-200 bg-white text-slate-900 hover:border-blue-600 hover:text-blue-600"
        }`}
      >
        {cta}
      </Link>
    </article>
  );
}
