"use client";

import Link from "next/link";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { EmptyReason } from "@/components/stats/EmptyReason";

import type { PerformanceInsight } from "./insights";
import type { PortfolioSummary } from "./load";

export function PortfolioView({ data }: { data: PortfolioSummary }) {
  const { formatMoney, formatOdds } = useDisplayPrefs();

  if (!data.signedIn) {
    return (
      <section className="rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-[#0f172a]">Sign in to track your bankroll</p>
        <p className="mt-2 max-w-xl text-sm text-[#64748b]">
          Save slips from the Bet Slip drawer, then grade them automatically when fixtures finish.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </section>
    );
  }

  const maxAbs = Math.max(1, ...data.chart.map((point) => Math.abs(point.cumulative)));

  return (
    <div className="space-y-8">
      <p className="text-sm text-[#64748b]">Signed in as {data.email ?? "user"}</p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open stake" value={formatMoney(data.openStake)} />
        <Stat label="Settled P/L" value={formatMoney(data.settledProfit)} />
        <Stat
          label="Hit rate"
          value={data.hitRate == null ? "—" : `${(data.hitRate * 100).toFixed(0)}%`}
        />
        <Stat
          label="30d ROI"
          value={data.roi30d == null ? "—" : `${(data.roi30d * 100).toFixed(1)}%`}
        />
      </section>

      <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
          Last 30 days
        </p>
        <h2 className="mt-1 text-lg font-bold text-[#0f172a]">Cumulative profit</h2>
        {data.chart.length === 0 ? (
          <EmptyReason
            className="mt-4"
            detail="No settled slips in the last 30 days yet"
          />
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1">
            {data.chart.map((point) => {
              const height = Math.max(4, (Math.abs(point.cumulative) / maxAbs) * 100);
              const positive = point.cumulative >= 0;
              return (
                <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                  <div
                    title={`${point.day}: ${formatMoney(point.cumulative)}`}
                    className={`w-full max-w-[18px] rounded-t ${positive ? "bg-[#2563eb]" : "bg-amber-500"}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PerformanceInsights insights={data.insights} />

      <SlipList
        title="Active slips"
        empty="No active slips — save a priced slip from the Bet Slip drawer."
        bets={data.active}
        formatMoney={formatMoney}
        formatOdds={formatOdds}
      />
      <SlipList
        title="Settled slips"
        empty="No settled slips yet. Finished score-gradeable markets settle after FT."
        bets={data.settled}
        formatMoney={formatMoney}
        formatOdds={formatOdds}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[#0f172a]">{value}</p>
    </div>
  );
}

function PerformanceInsights({ insights }: { insights: PerformanceInsight[] }) {
  return (
    <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
        Performance Insights
      </p>
      <h2 className="mt-1 text-lg font-bold text-[#0f172a]">Your betting coach</h2>
      <p className="mt-1 text-sm text-[#64748b]">
        Habits from your settled slips — double down on strengths, cut the leaks.
      </p>

      {insights.length === 0 ? (
        <EmptyReason
          className="mt-4"
          detail="Need at least 3 settled slips in a market bucket before coaching kicks in"
          source="user_bets"
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {insights.map((insight) => (
            <li
              key={`${insight.kind}:${insight.marketLabel}`}
              className={`rounded-xl border px-4 py-3 ${
                insight.kind === "strength"
                  ? "border-emerald-200 bg-emerald-50/70"
                  : insight.kind === "leak"
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-[#e2e8f0] bg-[#eef3f9]/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
                    {insight.kind === "strength"
                      ? "Strength"
                      : insight.kind === "leak"
                        ? "Leak"
                        : "Watch"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0f172a]">{insight.title}</p>
                </div>
                <div className="text-right text-xs font-semibold tabular-nums text-[#0f172a]">
                  <p>{insight.hitRatePct}% hit</p>
                  <p className={insight.roiPct >= 0 ? "text-emerald-700" : "text-amber-700"}>
                    {insight.roiPct >= 0 ? "+" : ""}
                    {insight.roiPct}% ROI
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">{insight.detail}</p>
              <p className="mt-1 text-[11px] text-[#94a3b8]">n={insight.sampleSize} settled</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SlipList({
  title,
  empty,
  bets,
  formatMoney,
  formatOdds,
}: {
  title: string;
  empty: string;
  bets: PortfolioSummary["active"];
  formatMoney: (n: number | null | undefined) => string;
  formatOdds: (n: number | null | undefined) => string | null;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-[#0f172a]">{title}</h2>
      {bets.length === 0 ? (
        <EmptyReason className="mt-3" detail={empty} />
      ) : (
        <ul className="mt-3 space-y-3">
          {bets.map((bet) => (
            <li
              key={bet.id}
              className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold tracking-wide text-[#64748b] uppercase">
                    {bet.status} · {bet.legs.length} leg{bet.legs.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#0f172a]">
                    Stake {formatMoney(bet.stake)} @ {formatOdds(bet.combined_odds) ?? "—"}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums text-[#2563eb]">
                  {bet.profit == null ? `To return ${formatMoney(bet.potential_return)}` : formatMoney(bet.profit)}
                </p>
              </div>
              <ul className="mt-3 space-y-1 border-t border-[#f1f5f9] pt-3">
                {bet.legs.map((leg, index) => (
                  <li key={`${bet.id}-${index}`} className="flex justify-between gap-3 text-xs text-[#64748b]">
                    <span className="min-w-0 truncate">
                      {leg.label}
                      {leg.match ? ` · ${leg.match}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {formatOdds(leg.decimalOdds) ?? "—"}
                      {leg.result && leg.result !== "pending" ? ` · ${leg.result}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
