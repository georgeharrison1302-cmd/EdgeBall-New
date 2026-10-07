import Link from "next/link";

import type { TeamMatch } from "./match-logs";
import type { RoundGroup } from "./rounds";
import type { PlayerStreak } from "./streaks";
import { CornersSortableTable } from "./corners-sortable-table";
import { RankingsSortableTable } from "./rankings-sortable-table";
import { Form } from "./ui";
import { XgSortableTable } from "./xg-sortable-table";

export type ClubRow = {
  teamId: number;
  team: string;
  logo: string | null;
  rank: number | null;
  form: string | null;
  played: number | null;
  points: number | null;
};

type Split = "overall" | "home" | "away" | "last5";
type CornerSide = "for" | "against" | "total";
type CornerVenue = "overall" | "home" | "away";
type CornerGames = "season" | "last10" | "last5";

export function ViewHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

export function PillLinks({ options, current, href }: { options: Array<{ id: string; label: string }>; current: string; href: (id: string) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.id}
          href={href(option.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${option.id === current ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function RankingsView({
  title,
  clubs,
  matches,
  windowDays,
  href,
}: {
  title: string;
  clubs: ClubRow[];
  matches: TeamMatch[];
  windowDays: number | null;
  href: (id: string) => string;
}) {
  const rows = rankingRows(clubs, matches, windowDays);
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <ViewHeading title={`${title} power rankings`} subtitle="Attack is stored expected goals per game. Defence is expected goals conceded per game. Overall is the gap between them." />
      <div className="mt-4">
        <PillLinks
          current={windowDays == null ? "season" : String(windowDays)}
          href={href}
          options={[
            { id: "season", label: "Season" },
            { id: "7", label: "7 days" },
            { id: "14", label: "14 days" },
            { id: "30", label: "30 days" },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748b]">
          No match sheets stored for this window — power rankings need expected goals from finished fixtures
          (fixture_statistics).
        </p>
      ) : (
        <RankingsSortableTable rows={rows} />
      )}
    </section>
  );
}

export function XgView({
  title,
  season,
  clubs,
  matches,
  split,
  href,
}: {
  title: string;
  season: number;
  clubs: ClubRow[];
  matches: TeamMatch[];
  split: Split;
  href: (id: string) => string;
}) {
  const rows = xgRows(clubs, matches, split);
  const sheeted = rows.filter((row) => row.xg != null && row.xga != null);
  const over = [...sheeted].sort((left, right) => (right.goalGap ?? -99) - (left.goalGap ?? -99))[0];
  const under = [...sheeted].sort((left, right) => (left.goalGap ?? 99) - (right.goalGap ?? 99))[0];
  const attack = [...sheeted].sort((left, right) => (right.xgPerGame ?? -1) - (left.xgPerGame ?? -1))[0];
  const defence = [...sheeted]
    .filter((row) => row.xgaPerGame != null)
    .sort((left, right) => (left.xgaPerGame ?? 99) - (right.xgaPerGame ?? 99))[0];
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <ViewHeading title={`${title} xG table ${season}`} subtitle="Goals against the stored expected goals. A plus means more goals than the match sheets expected." />
      <div className="mt-4">
        <PillLinks
          current={split}
          href={href}
          options={[
            { id: "overall", label: "Overall" },
            { id: "home", label: "Home" },
            { id: "away", label: "Away" },
            { id: "last5", label: "Last 5" },
          ]}
        />
      </div>
      {sheeted.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748b]">
          No match sheets stored for this split — expected goals come from finished fixture statistics
          (fixture_statistics).
        </p>
      ) : (
        <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Callout label="Biggest overperformer" name={over?.team} detail={over ? `${goalLabel(over.goalsFor)} from ${fixed(over.xg, 1)} xG` : null} />
        <Callout label="Biggest underperformer" name={under?.team} detail={under ? `${goalLabel(under.goalsFor)} from ${fixed(under.xg, 1)} xG` : null} />
        <Callout label="Best attack" name={attack?.team} detail={attack?.xgPerGame == null ? null : `${attack.xgPerGame.toFixed(2)} xG per game`} />
        <Callout label="Best defence" name={defence?.team} detail={defence?.xgaPerGame == null ? null : `${defence.xgaPerGame.toFixed(2)} xGA per game`} />
      </div>
      <XgSortableTable rows={sheeted} split={split} />
        </>
      )}
    </section>
  );
}

export function CornersView({
  title,
  season,
  clubs,
  matches,
  rounds,
  side,
  venue,
  games,
  href,
}: {
  title: string;
  season: number;
  clubs: ClubRow[];
  matches: TeamMatch[];
  rounds: RoundGroup[];
  side: CornerSide;
  venue: CornerVenue;
  games: CornerGames;
  href: (key: "side" | "venue" | "games", id: string) => string;
}) {
  const next = nextOpponents(rounds);
  const rows = cornerRows(clubs, matches, side, venue, games).map((row) => ({
    ...row,
    nextOpponent: next.get(row.teamId)?.name ?? null,
  }));
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <ViewHeading title={`${title} corner stats ${season}`} subtitle="Corner kicks from stored match sheets. The percentages are how often that side reached the line. Corner prices are not stored." />
      <div className="mt-4 flex flex-wrap gap-4">
        <PillLinks current={side} href={(id) => href("side", id)} options={[{ id: "for", label: "For" }, { id: "against", label: "Against" }, { id: "total", label: "Total" }]} />
        <PillLinks current={venue} href={(id) => href("venue", id)} options={[{ id: "overall", label: "Overall" }, { id: "home", label: "Home" }, { id: "away", label: "Away" }]} />
        <PillLinks current={games} href={(id) => href("games", id)} options={[{ id: "season", label: "Season" }, { id: "last10", label: "Last 10" }, { id: "last5", label: "Last 5" }]} />
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748b]">
          No corner counts stored for this split — corners come from finished match sheets
          (fixture_statistics).
        </p>
      ) : (
        <CornersSortableTable rows={rows} />
      )}
    </section>
  );
}

export function StreaksView({
  title,
  season,
  rows,
  stat,
  line,
  href,
}: {
  title: string;
  season: number;
  rows: PlayerStreak[];
  stat: string;
  line: string;
  href: (key: "stat" | "line", id: string) => string;
}) {
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <ViewHeading
        title={`${title} player streaks ${season}`}
        subtitle={
          rows.some((row) => row.source === "season")
            ? "Last-5 form is not stored yet — ranking season averages at or above the line from player season rates."
            : "A streak is consecutive stored appearances at or above the line, counting back from the latest match."
        }
      />
      <div className="mt-4 flex flex-wrap gap-4">
        <PillLinks
          current={stat}
          href={(id) => href("stat", id)}
          options={[
            { id: "shots", label: "Shots" },
            { id: "sot", label: "Shots on target" },
            { id: "fouls", label: "Fouls" },
            { id: "tackles", label: "Tackles" },
          ]}
        />
        <PillLinks current={line} href={(id) => href("line", id)} options={[{ id: "1", label: "1+" }, { id: "2", label: "2+" }, { id: "3", label: "3+" }]} />
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No season rates clear this line yet (player_season_stats).
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="py-2" title="Rank">#</th>
                <th className="py-2" title="Player">Player</th>
                <th className="py-2 text-right" title="Current consecutive streak at or above the line">Streak</th>
                <th className="py-2 text-right" title="Average per appearance">Avg</th>
                <th className="py-2" title="Last five match values or season proof">Proof</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.playerId}-${line}-${index}`} className="border-t border-gray-100">
                  <td className="py-2 text-gray-500">{index + 1}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {row.photo ? <img src={row.photo} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="h-7 w-7 rounded-full bg-blue-50" />}
                      <span>
                        <span className="block font-medium text-slate-900">{row.name}</span>
                        <span className="block text-xs text-gray-500">{[row.position, row.team].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold text-blue-700">
                    {row.source === "season" ? "–" : row.streak}
                  </td>
                  <td className="py-2 text-right">{row.average == null ? "–" : row.average.toFixed(1)}</td>
                  <td className="py-2">
                    {row.last5.length === 0 ? (
                      <span className="text-xs text-gray-500">Season avg (no match logs stored)</span>
                    ) : (
                      <span className="flex gap-1">
                        {row.last5.map((value, box) => (
                          <span
                            key={`${row.playerId}-${box}`}
                            className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[10px] font-bold ${
                              value != null && value >= Number(line)
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {value ?? "–"}
                          </span>
                        ))}
                      </span>
                    )}
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

const LINES = [3.5, 4.5, 5.5, 6.5, 7.5];

function rankingRows(clubs: ClubRow[], matches: TeamMatch[], windowDays: number | null) {
  const cutoff = windowDays == null ? null : Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return clubs
    .flatMap((club) => {
      const all = matches.filter((match) => match.teamId === club.teamId);
      const scoped = cutoff == null ? all : all.filter((match) => Date.parse(match.kickoff) >= cutoff);
      const attack = averageOf(scoped, "xg");
      const defence = averageOf(scoped, "xga");
      if (scoped.length === 0 || attack == null || defence == null) return [];
      const seasonAttack = averageOf(all, "xg");
      const seasonDefence = averageOf(all, "xga");
      const overall = attack - defence;
      const seasonOverall = seasonAttack == null || seasonDefence == null ? null : seasonAttack - seasonDefence;
      const recent = all.slice(-5).flatMap((match) => (match.xg == null || match.xga == null ? [] : [match.xg - match.xga]));
      const recentAverage = recent.length === 0 ? null : recent.reduce((sum, value) => sum + value, 0) / recent.length;
      return [
        {
          ...club,
          attack,
          defence,
          overall,
          change: recentAverage == null ? null : recentAverage - (cutoff == null ? overall : seasonOverall ?? overall),
          trend: recent,
        },
      ];
    })
    .sort((left, right) => right.overall - left.overall);
}

function xgRows(clubs: ClubRow[], matches: TeamMatch[], split: Split) {
  return clubs
    .flatMap((club) => {
      const all = matches.filter((match) => match.teamId === club.teamId);
      const scoped = split === "home" ? all.filter((match) => match.home) : split === "away" ? all.filter((match) => !match.home) : split === "last5" ? all.slice(-5) : all;
      if (scoped.length === 0) return [];
      const goalsFor = scoped.reduce((sum, match) => sum + match.goalsFor, 0);
      const goalsAgainst = scoped.reduce((sum, match) => sum + match.goalsAgainst, 0);
      const xg = sumDefined(scoped, "xg");
      const xga = sumDefined(scoped, "xga");
      const points = split === "overall" && club.points != null ? club.points : scoped.reduce((sum, match) => sum + pointsFor(match), 0);
      return [
        {
          ...club,
          played: scoped.length,
          form: split === "overall" && club.form ? club.form : scoped.slice(-5).map(letter).join(""),
          goalsFor,
          goalsAgainst,
          xg,
          xga,
          xgPerGame: xg == null ? null : xg / scoped.length,
          xgaPerGame: xga == null ? null : xga / scoped.length,
          goalGap: xg == null ? null : goalsFor - xg,
          concedeGap: xga == null ? null : goalsAgainst - xga,
          gd: goalsFor - goalsAgainst,
          xgd: xg == null || xga == null ? null : xg - xga,
          gdGap: xg == null || xga == null ? null : goalsFor - goalsAgainst - (xg - xga),
          points,
        },
      ];
    })
    .sort((left, right) => (split === "overall" ? (left.rank ?? 99) - (right.rank ?? 99) : right.points - left.points || right.gd - left.gd));
}

function cornerRows(clubs: ClubRow[], matches: TeamMatch[], side: CornerSide, venue: CornerVenue, games: CornerGames) {
  return clubs
    .flatMap((club) => {
      const scoped = matches.filter((match) => match.teamId === club.teamId && (venue === "overall" || (venue === "home" ? match.home : !match.home)));
      const windowed = games === "last5" ? scoped.slice(-5) : games === "last10" ? scoped.slice(-10) : scoped;
      const values = windowed.flatMap((match) => {
        const value = side === "for" ? match.cornersFor : side === "against" ? match.cornersAgainst : match.cornersFor == null || match.cornersAgainst == null ? null : match.cornersFor + match.cornersAgainst;
        return value == null ? [] : [value];
      });
      if (values.length === 0) return [];
      const rates: Record<number, number> = {};
      for (const line of LINES) rates[line] = Math.round((values.filter((value) => value >= line).length / values.length) * 100);
      return [
        {
          ...club,
          last5: values.slice(-5),
          rates,
          average: values.reduce((sum, value) => sum + value, 0) / values.length,
        },
      ];
    })
    .sort((left, right) => right.average - left.average);
}

function nextOpponents(rounds: RoundGroup[]) {
  const map = new Map<number, { name: string; logo: string | null }>();
  for (const round of rounds) {
    for (const fixture of round.fixtures) {
      if (fixture.called || fixture.score != null) continue;
      if (fixture.homeId != null && !map.has(fixture.homeId)) map.set(fixture.homeId, { name: fixture.away, logo: fixture.awayLogo });
      if (fixture.awayId != null && !map.has(fixture.awayId)) map.set(fixture.awayId, { name: fixture.home, logo: fixture.homeLogo });
    }
  }
  return map;
}

function averageOf(rows: TeamMatch[], key: "xg" | "xga") {
  const values = rows.flatMap((row) => (row[key] == null ? [] : [row[key]]));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumDefined(rows: TeamMatch[], key: "xg" | "xga") {
  const values = rows.flatMap((row) => (row[key] == null ? [] : [row[key]]));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function pointsFor(match: TeamMatch) {
  if (match.goalsFor > match.goalsAgainst) return 3;
  if (match.goalsFor === match.goalsAgainst) return 1;
  return 0;
}

function letter(match: TeamMatch) {
  if (match.goalsFor > match.goalsAgainst) return "W";
  if (match.goalsFor === match.goalsAgainst) return "D";
  return "L";
}

function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-gray-400">–</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 72;
      const y = 22 - ((value - min) / span) * 20;
      return `${x},${y}`;
    })
    .join(" ");
  const rising = values.at(-1)! >= values[0];
  return (
    <svg width="72" height="24" className={rising ? "text-green-600" : "text-red-600"} aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
}

function Callout({ label, name, detail }: { label: string; name?: string; detail: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{name ?? "–"}</p>
      <p className="text-sm text-blue-700">{detail ?? "–"}</p>
    </div>
  );
}

function signed(value: number | null, digits: number) {
  if (value == null || Number.isNaN(value)) return "–";
  const text = `${value > 0 ? "+" : ""}${digits === 0 ? Math.round(value) : value.toFixed(digits)}`;
  const tone = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  return <span className={`font-semibold ${tone}`}>{text}</span>;
}

function fixed(value: number | null, digits: number) {
  return value == null || Number.isNaN(value) ? "–" : value.toFixed(digits);
}

function count(value: number | null) {
  return value == null ? "–" : String(value);
}

function goalLabel(value: number | null) {
  if (value == null) return "–";
  return `${value} ${value === 1 ? "goal" : "goals"}`;
}
