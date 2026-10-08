import Link from "next/link";

import { EmptyReason } from "@/components/stats/EmptyReason";
import { formatMoney, formatOdds } from "@/utils/display-prefs";

import type { ModelGradingSummary } from "@/app/tracker/model-grading-load";

export function ModelGrading({ data }: { data: ModelGradingSummary }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tips (+edge > 5%)" value={String(data.tipCount)} />
        <Stat label="Settled" value={`${data.settledCount} · ${data.pendingCount} pending`} />
        <Stat
          label="Hit rate"
          value={data.hitRate == null ? "—" : `${(data.hitRate * 100).toFixed(0)}%`}
        />
        <Stat
          label={`All-time P/L (£${data.unitStake}/tip)`}
          value={
            data.settledCount === 0
              ? "—"
              : `${formatMoney(data.totalProfit, "GBP")} · ROI ${
                  data.roi == null ? "—" : `${(data.roi * 100).toFixed(1)}%`
                }`
          }
        />
      </section>

      <p className="text-sm text-muted">
        Public model ledger: Poisson card tips with stored <code className="text-xs">edge_pct &gt; 5</code>, plus
        Match Winner tips where prediction % beats Bet365 by more than 5%. Card tips stay pending until{" "}
        <code className="text-xs">fixture_events</code> are ingested.         Personal bankroll lives under the{" "}
        <Link href="/portfolio?tab=bets" className="font-semibold text-cobalt">
          My Bets
        </Link>{" "}
        tab.
      </p>

      {data.markets.length > 0 ? (
        <section>
          <h3 className="text-sm font-bold tracking-wide text-ink uppercase">
            Per-market ledger
          </h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Tips</th>
                  <th className="px-3 py-2 font-medium">Settled</th>
                  <th className="px-3 py-2 font-medium">W-L</th>
                  <th className="px-3 py-2 font-medium">Hit rate</th>
                  <th className="px-3 py-2 font-medium">Avg edge</th>
                  <th className="px-3 py-2 font-medium">P/L</th>
                  <th className="px-3 py-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((market) => (
                  <tr key={market.family} className="border-b border-[#f1f5f9]">
                    <td className="px-3 py-2 font-semibold text-ink">{market.label}</td>
                    <td className="px-3 py-2 tabular-nums text-ink">{market.tips}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {market.settled}
                      {market.pending > 0 ? ` · ${market.pending} pending` : ""}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink">
                      {market.settled === 0 ? "—" : `${market.wins}-${market.losses}`}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink">
                      {market.hitRate == null ? "—" : `${(market.hitRate * 100).toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted">
                      {market.avgEdge == null ? "—" : `+${market.avgEdge.toFixed(1)}%`}
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold tabular-nums ${
                        market.settled === 0
                          ? "text-muted"
                          : market.profit >= 0
                            ? "text-cobalt"
                            : "text-red-600"
                      }`}
                    >
                      {market.settled === 0 ? "—" : formatMoney(market.profit, "GBP")}
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold tabular-nums ${
                        market.roi == null
                          ? "text-muted"
                          : market.roi >= 0
                            ? "text-cobalt"
                            : "text-red-600"
                      }`}
                    >
                      {market.roi == null ? "—" : `${(market.roi * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            Markets that stay negative over a meaningful sample get re-priced or retired — this table
            is the tuning board. Goals, BTTS, team cards and fouls columns populate as those tip
            generators come online.
          </p>
        </section>
      ) : null}

      {data.tips.length === 0 ? (
        <EmptyReason
          variant="panel"
          title="No edged tips yet"
          detail="Run calc:edges for card Poisson edges, or wait for predictions + Bet365 1X2 with edge over 5%"
          source="prematch_odds"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-3 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Selection</th>
                <th className="px-3 py-2 font-medium">Odds</th>
                <th className="px-3 py-2 font-medium">Edge</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">P/L</th>
              </tr>
            </thead>
            <tbody>
              {data.tips.map((tip) => (
                <tr key={tip.id} className="border-b border-[#f1f5f9]">
                  <td className="px-3 py-2">
                    <Link href={`/fixtures/${tip.fixtureId}`} className="font-semibold text-ink hover:text-cobalt">
                      {tip.match}
                    </Link>
                    <p className="text-[11px] text-muted">{tip.market}</p>
                  </td>
                  <td className="px-3 py-2 text-ink">{tip.selection}</td>
                  <td className="px-3 py-2 tabular-nums">{formatOdds(tip.odds, "decimal")}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-cobalt">
                    +{tip.edgePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 capitalize text-muted">{tip.status}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {tip.profit == null ? "—" : formatMoney(tip.profit, "GBP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
