import type { Metadata } from "next";

import { Shell } from "../competitions/ui";
import { loadFixtureBets, splitBySample } from "./load";
import type { FixtureBet } from "./math";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fixture bets · EdgeBall",
  description: "Tonight's match lines where the season rate is ahead of the Bet365 price.",
};

export default async function FixtureBetsPage() {
  const board = splitBySample(await loadFixtureBets());
  return (
    <Shell current="bets">
      <p className="text-[11px] font-extrabold tracking-[0.12em] text-[#2563eb] uppercase">Fixture bets</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Today's match markets</h1>
      <p className="mt-2 max-w-3xl text-sm text-[#64748b]">
        Ranked by expected return on 1 unit. The chance comes from goals per game, and a side with no goals is left out.
        Rows from two games or fewer sit in their own list, so a short table does not lead the board.
      </p>
      <h2 className="mt-8 text-lg font-semibold">Longer tables</h2>
      <BetTable bets={board.main} empty="No priced line from more than two games is ahead of the rate." />
      <h2 className="mt-8 text-lg font-semibold">Two games or fewer</h2>
      <p className="mt-1 text-sm text-[#64748b]">Same sum, from a short table. The return is larger because the sample is small.</p>
      <BetTable bets={board.short} empty="No short-sample line is ahead of the rate." />
    </Shell>
  );
}

function BetTable({ bets, empty }: { bets: FixtureBet[]; empty: string }) {
  if (bets.length === 0) {
    return <p className="mt-3 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-6 text-sm text-[#64748b]">{empty}</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-[11px] tracking-wide text-[#64748b] uppercase">
          <tr>
            <th className="px-3 py-3" title="Fixture">Match</th>
            <th className="px-3 py-3" title="Kick-off time">Kickoff</th>
            <th className="px-3 py-3" title="Market type">Type</th>
            <th className="px-3 py-3" title="Selection">Pick</th>
            <th className="px-3 py-3 text-right" title="Theoretical return percentage">Return</th>
            <th className="px-3 py-3 text-right" title="Historical hit rate">Rate</th>
            <th className="px-3 py-3 text-right" title="Implied bookmaker probability">Price</th>
            <th className="px-3 py-3 text-right" title="Model edge versus the book">Edge</th>
            <th className="px-3 py-3 text-right" title="Decimal odds">Odds</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => (
            <tr key={`${bet.fixtureId}-${bet.pick}`} className="border-t border-[#f1f5f9]">
              <td className="px-3 py-3">
                <span className="font-semibold">{bet.match}</span>
                <span className="block text-xs text-[#64748b]">
                  {bet.competition} · {bet.games} games
                </span>
              </td>
              <td className="px-3 py-3">{bet.kickoff}</td>
              <td className="px-3 py-3">{bet.type}</td>
              <td className="px-3 py-3">{bet.pick}</td>
              <td className="px-3 py-3 text-right font-semibold text-[#166534]">+{bet.roi}%</td>
              <td className="px-3 py-3 text-right">{bet.rate}%</td>
              <td className="px-3 py-3 text-right">{bet.price}%</td>
              <td className="px-3 py-3 text-right font-semibold text-[#166534]">+{bet.edge}</td>
              <td className="px-3 py-3 text-right">{bet.odd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
