import type { Metadata } from "next";

import { EmptyReason } from "@/components/stats/EmptyReason";

import { loadRefereeDesk } from "./load";
import { RefereeDeskTable } from "./referee-desk-table";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Referee Desk · EdgeBall",
  description:
    "Card-market referee context: cards per game, over 3.5/4.5 card rates and strictness versus the pool average.",
};

export default async function RefereesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  const leagueId = Number(league);
  const scoped = Number.isInteger(leagueId) && leagueId > 0 ? leagueId : undefined;

  const data = await loadRefereeDesk(scoped);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-wider text-[#2563eb]">Card market context</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a]">Referee Desk</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        How many cards each referee actually shows, computed from finished fixtures and their stored
        stats sheets — the same referee rates used for card props in the Match Hub. Use O3.5%/O4.5%
        and the strictness badge to frame card-line bets; check the Match Hub for the priced line.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Referees graded" value={String(data.rows.length)} />
        <Stat label="Fixture pool" value={String(data.fixturePool)} />
        <Stat
          label="Pool avg cards/game"
          value={data.avgCards != null ? data.avgCards.toFixed(2) : "—"}
        />
      </div>

      <div className="mt-8">
        {data.rows.length === 0 ? (
          <EmptyReason
            title="No referee grades yet"
            detail="Finished fixtures with a named referee and a stored stats sheet are required to grade card rates"
            source="fixtures + fixture_statistics"
          />
        ) : (
          <>
            <RefereeDeskTable
              rows={data.rows}
              leagues={data.leagues}
              selectedLeague={data.selectedLeague}
            />
            <p className="mt-3 text-xs text-slate-400">
              Referees with fewer than 3 graded matches are hidden
              {data.smallSampleCount > 0 ? ` (${data.smallSampleCount} omitted)` : ""}. Rates come
              from the {data.fixturePool.toLocaleString()} most recent finished fixtures in store.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[#0f172a]">{value}</p>
    </div>
  );
}
