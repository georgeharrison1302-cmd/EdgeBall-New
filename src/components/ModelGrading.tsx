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

      <p className="text-sm text-[#64748b]">
        Public model ledger: Poisson card tips with stored <code className="text-xs">edge_pct &gt; 5</code>, plus
        Match Winner tips where prediction % beats Bet365 by more than 5%. Card tips stay pending until{" "}
        <code className="text-xs">fixture_events</code> are ingested.         Personal bankroll lives under the{" "}
        <Link href="/portfolio?tab=bets" className="font-semibold text-[#2563eb]">
          My Bets
        </Link>{" "}
        tab.
      </p>

      {data.tips.length === 0 ? (
        <EmptyReason
          variant="panel"
          title="No edged tips yet"
          detail="Run calc:edges for card Poisson edges, or wait for predictions + Bet365 1X2 with edge over 5%"
          source="prematch_odds"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-[#64748b]">
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
                    <Link href={`/fixtures/${tip.fixtureId}`} className="font-semibold text-[#0f172a] hover:text-[#2563eb]">
                      {tip.match}
                    </Link>
                    <p className="text-[11px] text-[#64748b]">{tip.market}</p>
                  </td>
                  <td className="px-3 py-2 text-[#0f172a]">{tip.selection}</td>
                  <td className="px-3 py-2 tabular-nums">{formatOdds(tip.odds, "decimal")}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-[#2563eb]">
                    +{tip.edgePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 capitalize text-[#64748b]">{tip.status}</td>
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
    <div className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#0f172a]">{value}</p>
    </div>
  );
}
