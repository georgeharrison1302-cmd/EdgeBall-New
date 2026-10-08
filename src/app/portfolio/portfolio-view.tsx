"use client";

import Link from "next/link";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { EmptyReason } from "@/components/stats/EmptyReason";

import type { PerformanceInsight } from "./insights";
import type { MonthlyPnl, PortfolioAlert, PortfolioSummary } from "./load";
import type { MarketBreakdownRow } from "./insights";

export function PortfolioView({ data }: { data: PortfolioSummary }) {
  const { formatMoney, formatOdds } = useDisplayPrefs();

  if (!data.signedIn) {
    return (
      <section className="rounded-2xl border border-line bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-ink">Sign in to track your bankroll</p>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Save slips from the Bet Slip drawer, then grade them automatically when fixtures finish.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex rounded-full bg-cobalt px-5 py-2.5 text-sm font-bold text-white"
        >
          Sign in
        </Link>
      </section>
    );
  }

  const maxAbs = Math.max(1, ...data.chart.map((point) => Math.abs(point.cumulative)));

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">Signed in as {data.email ?? "user"}</p>

      <SlipAlerts alerts={data.alerts} />

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

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
          Last 30 days
        </p>
        <h2 className="mt-1 text-lg font-bold text-ink">Cumulative profit</h2>
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
                    className={`w-full max-w-[18px] rounded-t ${positive ? "bg-cobalt" : "bg-amber-500"}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PerformanceInsights insights={data.insights} />

      <MarketBreakdownTable rows={data.marketBreakdown} formatMoney={formatMoney} />
      <MonthlyPnlTable rows={data.monthly} formatMoney={formatMoney} />

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
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function PerformanceInsights({ insights }: { insights: PerformanceInsight[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
        Performance Insights
      </p>
      <h2 className="mt-1 text-lg font-bold text-ink">Your betting coach</h2>
      <p className="mt-1 text-sm text-muted">
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
                    : "border-line bg-canvas/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
                    {insight.kind === "strength"
                      ? "Strength"
                      : insight.kind === "leak"
                        ? "Leak"
                        : "Watch"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink">{insight.title}</p>
                </div>
                <div className="text-right text-xs font-semibold tabular-nums text-ink">
                  <p>{insight.hitRatePct}% hit</p>
                  <p className={insight.roiPct >= 0 ? "text-emerald-700" : "text-amber-700"}>
                    {insight.roiPct >= 0 ? "+" : ""}
                    {insight.roiPct}% ROI
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">{insight.detail}</p>
              <p className="mt-1 text-[11px] text-faint">n={insight.sampleSize} settled</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SlipAlerts({ alerts }: { alerts: PortfolioAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
        Slip alerts
      </p>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
              alert.kind === "won"
                ? "border-emerald-200 bg-emerald-50/70"
                : alert.kind === "lost"
                  ? "border-red-200 bg-red-50/70"
                  : alert.kind === "in_play"
                    ? "border-blue-200 bg-blue-50/70"
                    : "border-line bg-canvas/60"
            }`}
          >
            <span className="font-semibold text-ink">{alert.text}</span>
            <span className="shrink-0 text-xs text-muted">{alert.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketBreakdownTable({
  rows,
  formatMoney,
}: {
  rows: MarketBreakdownRow[];
  formatMoney: (n: number | null | undefined) => string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
        Market breakdown
      </p>
      <h2 className="mt-1 text-lg font-bold text-ink">Record by market</h2>
      {rows.length === 0 ? (
        <EmptyReason
          className="mt-4"
          detail="No decided slips yet — the breakdown fills in once slips settle"
          source="user_bets"
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[11px] tracking-wide text-faint uppercase">
                <th className="py-2 pr-3">Market</th>
                <th className="px-3 py-2 text-right">Slips</th>
                <th className="px-3 py-2 text-right">Won</th>
                <th className="px-3 py-2 text-right">Hit</th>
                <th className="px-3 py-2 text-right">Avg odds</th>
                <th className="px-3 py-2 text-right">Staked</th>
                <th className="px-3 py-2 text-right">P/L</th>
                <th className="py-2 pl-3 text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-[#f1f5f9]">
                  <td className="py-2.5 pr-3 font-semibold text-ink">{row.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.bets}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.wins}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.hitRatePct}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.avgOdds == null ? "—" : row.avgOdds.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.stake)}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                      row.profit >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatMoney(row.profit)}
                  </td>
                  <td
                    className={`py-2.5 pl-3 text-right font-bold tabular-nums ${
                      row.roiPct >= 0 ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {row.roiPct >= 0 ? "+" : ""}
                    {row.roiPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MonthlyPnlTable({
  rows,
  formatMoney,
}: {
  rows: MonthlyPnl[];
  formatMoney: (n: number | null | undefined) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
        Monthly P/L
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-[11px] tracking-wide text-faint uppercase">
              <th className="py-2 pr-3">Month</th>
              <th className="px-3 py-2 text-right">Slips</th>
              <th className="px-3 py-2 text-right">Staked</th>
              <th className="px-3 py-2 text-right">P/L</th>
              <th className="py-2 pl-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-[#f1f5f9]">
                <td className="py-2.5 pr-3 font-semibold text-ink">{row.month}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.bets}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.stake)}</td>
                <td
                  className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                    row.profit >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatMoney(row.profit)}
                </td>
                <td
                  className={`py-2.5 pl-3 text-right font-bold tabular-nums ${
                    row.roiPct >= 0 ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {row.roiPct >= 0 ? "+" : ""}
                  {row.roiPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {bets.length === 0 ? (
        <EmptyReason className="mt-3" detail={empty} />
      ) : (
        <ul className="mt-3 space-y-3">
          {bets.map((bet) => (
            <li
              key={bet.id}
              className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                    {bet.status} · {bet.legs.length} leg{bet.legs.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    Stake {formatMoney(bet.stake)} @ {formatOdds(bet.combined_odds) ?? "—"}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums text-cobalt">
                  {bet.profit == null ? `To return ${formatMoney(bet.potential_return)}` : formatMoney(bet.profit)}
                </p>
              </div>
              <ul className="mt-3 space-y-1 border-t border-[#f1f5f9] pt-3">
                {bet.legs.map((leg, index) => (
                  <li key={`${bet.id}-${index}`} className="flex justify-between gap-3 text-xs text-muted">
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
