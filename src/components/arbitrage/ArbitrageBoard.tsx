"use client";

import { useState } from "react";

import { ArbitrageCard } from "@/components/arbitrage/ArbitrageCard";
import type { ArbitrageOpportunity } from "@/lib/odds/arbitrage";

const BANKROLL_MIN = 10;
const BANKROLL_MAX = 1000;
const BANKROLL_DEFAULT = 100;

type Props = {
  opportunities: ArbitrageOpportunity[];
  unlocked: boolean;
  error?: string | null;
};

/**
 * SureBets board — bankroll slider drives stake/return on every arb card.
 */
export function ArbitrageBoard({ opportunities, unlocked, error = null }: Props) {
  const [bankroll, setBankroll] = useState(BANKROLL_DEFAULT);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
              SureBets
            </p>
            <h2 className="mt-0.5 text-xl font-black tracking-tight text-[#0f172a]">
              Bankroll
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Stakes and returns scale with your bankroll across every arb below.
            </p>
          </div>
          <p className="text-2xl font-black tabular-nums text-[#0f172a]">£{bankroll}</p>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Bankroll from £{BANKROLL_MIN} to £{BANKROLL_MAX}</span>
          <input
            type="range"
            min={BANKROLL_MIN}
            max={BANKROLL_MAX}
            step={10}
            value={bankroll}
            onChange={(event) => setBankroll(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#e2e8f0] accent-[#2563eb]"
          />
        </label>
        <div className="mt-1 flex justify-between text-[11px] font-semibold text-[#94a3b8]">
          <span>£{BANKROLL_MIN}</span>
          <span>£{BANKROLL_MAX}</span>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-[#e2e8f0] bg-[#eef3f9] px-4 py-6 text-sm text-[#64748b]">
          SureBets could not be loaded ({error}).
        </p>
      ) : opportunities.length === 0 ? (
        <p className="rounded-2xl border border-[#e2e8f0] bg-[#eef3f9] px-4 py-6 text-sm text-[#64748b]">
          No arbitrage opportunities stored right now for your selected Odds-API bookmakers.
        </p>
      ) : (
        <div className="space-y-4">
          {opportunities.map((opportunity) => (
            <ArbitrageCard
              key={opportunity.id}
              opportunity={opportunity}
              bankroll={bankroll}
              unlocked={unlocked}
            />
          ))}
        </div>
      )}
    </section>
  );
}
