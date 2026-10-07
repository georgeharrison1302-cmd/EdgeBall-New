"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import FixtureBoard from "@/app/fixtures/fixture-board";
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
  leagueId: number | null;
  status: string;
  view: "fixtures" | "surebets";
  day: DayLoad;
  shown: FixtureMatch[];
  counts: { all: number; upcoming: number; finished: number; live: number };
  days: string[];
  rail: RailCompetition[];
  arbitrage: ArbitrageOpportunity[];
  arbitrageError: string | null;
  unlocked: boolean;
};

/**
 * Match Hub grid — fixtures board + SureBets (Arb) tab.
 */
export function MatchGrid(props: Props) {
  const router = useRouter();
  const { date, leagueId, status, view } = props;
  const surebets = view === "surebets";

  function go(next: Partial<{ date: string; league: number | null; status: string; view: string }>) {
    router.push(
      hubHref({
        date: next.date ?? date,
        league: next.league === undefined ? leagueId : next.league,
        status: next.status ?? status,
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
          <ul className="mt-3 space-y-1">
            {props.rail.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-gray-500">No competitions stored.</li>
            ) : (
              props.rail.map((competition) => (
                <li key={competition.id}>
                  <Link
                    href={hubHref({
                      date,
                      league: competition.id,
                      status,
                      view,
                    })}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      leagueId === competition.id
                        ? "bg-blue-50 font-semibold text-blue-600"
                        : "text-slate-900"
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
          <button
            type="button"
            onClick={() => go({ league: null })}
            className={`mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm ${
              leagueId == null ? "bg-blue-50 font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            All competitions
          </button>
          <Link href="/competitions" className="mt-3 block text-sm font-semibold text-blue-600">
            Browse leagues →
          </Link>
        </aside>

        <div>
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusLink
              label="Fixtures"
              active={!surebets}
              href={hubHref({ date, league: leagueId, status, view: "fixtures" })}
            />
            <StatusLink
              label="⚡️ SureBets (Arb)"
              active={surebets}
              href={hubHref({ date, league: leagueId, status, view: "surebets" })}
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
              <div className="mt-4 flex gap-2 overflow-x-auto">
                {props.days.map((dayKey) => (
                  <Link
                    key={dayKey}
                    href={hubHref({ date: dayKey, league: leagueId, status, view })}
                    className={`shrink-0 rounded-xl px-3 py-2 text-center text-sm ${
                      dayKey === date
                        ? "bg-blue-600 font-semibold text-white"
                        : "border border-gray-200 bg-white text-slate-900"
                    }`}
                  >
                    <span className="block text-[10px] uppercase">{dayLabel(dayKey)}</span>
                    <span className="block">{dayKey.slice(8)}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <StatusLink
                  label={`All ${props.counts.all}`}
                  active={status === "all"}
                  href={hubHref({ date, league: leagueId, status: "all", view })}
                />
                <StatusLink
                  label={`Upcoming ${props.counts.upcoming}`}
                  active={status === "upcoming"}
                  href={hubHref({ date, league: leagueId, status: "upcoming", view })}
                />
                <StatusLink
                  label={`Finished ${props.counts.finished}`}
                  active={status === "finished"}
                  href={hubHref({ date, league: leagueId, status: "finished", view })}
                />
                <StatusLink
                  label={`Live ${props.counts.live}`}
                  active={status === "live"}
                  href={hubHref({ date, league: leagueId, status: "live", view })}
                />
              </div>
              <div className="mt-4">
                <FixtureBoard matches={props.shown} />
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
      href={href}
      className={`rounded-full px-3 py-1 ${
        active
          ? "bg-blue-600 font-semibold text-white"
          : "border border-gray-200 bg-white text-gray-600"
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
  view?: string;
}) {
  const query = new URLSearchParams();
  query.set("date", next.date);
  if (next.league != null) query.set("league", String(next.league));
  if (next.status !== "all") query.set("status", next.status);
  if (next.view && next.view !== "fixtures") query.set("view", next.view);
  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}

function londonToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayLabel(date: string) {
  const today = londonToday();
  if (date === today) return "Today";
  if (date === shiftDate(today, 1)) return "Tomorrow";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
