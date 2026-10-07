"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import FixtureBoard from "@/app/fixtures/fixture-board";
import { fixtureDateLabel } from "@/app/fixtures/board-utils";
import type { DayLoad, FixtureMatch } from "@/app/fixtures/types";
import { LeagueLogo } from "@/components/assets";
import { ArbitrageBoard } from "@/components/arbitrage/ArbitrageBoard";
import type { ArbitrageOpportunity } from "@/lib/odds/arbitrage";

type RailCompetition = {
  id: number;
  name: string;
  logoUrl: string | null;
};

type Props = {
  date: string;
  today: string;
  leagueId: number | null;
  status: string;
  pricedOnly: boolean;
  view: "fixtures" | "surebets";
  day: DayLoad;
  shown: FixtureMatch[];
  counts: { all: number; upcoming: number; finished: number; live: number; priced: number };
  days: string[];
  rail: RailCompetition[];
  arbitrage: ArbitrageOpportunity[];
  arbitrageError: string | null;
  unlocked: boolean;
};

/** Fixture-first home grid: date rail → competition groups → Match Hub. */
export function MatchGrid(props: Props) {
  const router = useRouter();
  const { date, today, leagueId, status, pricedOnly, view } = props;
  const surebets = view === "surebets";

  function go(next: Partial<{
    date: string;
    league: number | null;
    status: string;
    priced: boolean;
    view: string;
  }>) {
    router.push(
      hubHref({
        date: next.date ?? date,
        league: next.league === undefined ? leagueId : next.league,
        status: next.status ?? status,
        priced: next.priced === undefined ? pricedOnly : next.priced,
        view: next.view === undefined ? view : next.view,
      }),
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
            Top competitions
          </p>
          <Link
            prefetch={false}
            href={hubHref({ date, league: null, status, priced: pricedOnly, view })}
            className={`mt-3 flex items-center rounded-lg px-2 py-1.5 text-sm ${
              leagueId == null ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            All competitions
          </Link>
          <ul className="mt-1 space-y-1">
            {props.rail.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-gray-500">No competitions stored.</li>
            ) : (
              props.rail.map((competition) => (
                <li key={competition.id}>
                  <Link
                    prefetch={false}
                    href={hubHref({
                      date,
                      league: competition.id,
                      status,
                      priced: pricedOnly,
                      view,
                    })}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      leagueId === competition.id
                        ? "bg-blue-50 font-semibold text-blue-600"
                        : "text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <LeagueLogo
                      src={competition.logoUrl}
                      leagueId={competition.id}
                      leagueName={competition.name}
                      size={16}
                    />
                    <span className="truncate">{competition.name}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <Link href="/competitions" className="mt-3 block text-sm font-semibold text-blue-600">
            Browse leagues →
          </Link>
        </aside>

        <div>
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusLink
              label="Fixtures"
              active={!surebets}
              href={hubHref({ date, league: leagueId, status, priced: pricedOnly, view: "fixtures" })}
            />
            <StatusLink
              label="SureBets"
              active={surebets}
              href={hubHref({ date, league: leagueId, status, priced: pricedOnly, view: "surebets" })}
            />
          </div>

          {surebets ? (
            <div className="mt-4">
              <ArbitrageBoard
                opportunities={props.arbitrage}
                unlocked={props.unlocked}
                error={props.arbitrageError}
              />
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                {props.days.map((dayKey) => (
                  <Link
                    prefetch={false}
                    key={dayKey}
                    href={hubHref({ date: dayKey, league: leagueId, status, priced: pricedOnly, view })}
                    className={`shrink-0 rounded-xl px-3 py-2 text-center text-sm shadow-sm transition-colors ${
                      dayKey === date
                        ? "bg-blue-600 font-semibold text-white"
                        : "border border-[#e2e8f0] bg-white text-slate-900 hover:border-[#2563eb]"
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase">
                      {fixtureDateLabel(dayKey, today)}
                    </span>
                    <span className="block">{dayKey.slice(8)}</span>
                  </Link>
                ))}
                <label className="shrink-0 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="block text-[10px] font-bold text-[#64748b] uppercase">Calendar</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      if (event.target.value) go({ date: event.target.value });
                    }}
                    className="mt-0.5 block w-[7.5rem] bg-transparent text-sm text-slate-900 outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <StatusLink
                  label={`All ${props.counts.all}`}
                  active={status === "all"}
                  href={hubHref({ date, league: leagueId, status: "all", priced: pricedOnly, view })}
                />
                <StatusLink
                  label={`Live ${props.counts.live}`}
                  active={status === "live"}
                  href={hubHref({ date, league: leagueId, status: "live", priced: pricedOnly, view })}
                />
                <StatusLink
                  label={`Upcoming ${props.counts.upcoming}`}
                  active={status === "upcoming"}
                  href={hubHref({ date, league: leagueId, status: "upcoming", priced: pricedOnly, view })}
                />
                <StatusLink
                  label={`Finished ${props.counts.finished}`}
                  active={status === "finished"}
                  href={hubHref({ date, league: leagueId, status: "finished", priced: pricedOnly, view })}
                />
                <button
                  type="button"
                  onClick={() => go({ priced: !pricedOnly })}
                  className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                    pricedOnly
                      ? "bg-blue-600 text-white"
                      : "border border-[#e2e8f0] bg-white text-gray-600 hover:border-blue-600"
                  }`}
                >
                  Priced {props.counts.priced}
                </button>
              </div>
              <div className="mt-4">
                <FixtureBoard
                  matches={props.shown}
                  emptyDetail={
                    pricedOnly
                      ? "No fixtures with stored bookmaker prices for this selection"
                      : "No fixtures stored for this date"
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      prefetch={false}
      href={href}
      className={`rounded-full px-3 py-1 transition-colors ${
        active
          ? "bg-blue-600 font-semibold text-white"
          : "border border-[#e2e8f0] bg-white text-gray-600 hover:border-blue-600"
      }`}
    >
      {label}
    </Link>
  );
}

export function hubHref(next: {
  date: string;
  league: number | null;
  status: string;
  priced?: boolean;
  view?: string;
}) {
  const query = new URLSearchParams();
  query.set("date", next.date);
  if (next.league != null) query.set("league", String(next.league));
  if (next.status !== "all") query.set("status", next.status);
  if (next.priced) query.set("priced", "1");
  if (next.view && next.view !== "fixtures") query.set("view", next.view);
  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}
