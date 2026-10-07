"use client";

import { useMemo, useState } from "react";

import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";

import type { SeasonPlayer } from "./data";

const PREVIEW = 10;

const PLAYER_PILLS = [
  { id: "goals", label: "Goals" },
  { id: "assists", label: "Assists" },
  { id: "shots", label: "Shots" },
  { id: "shotsOn", label: "Shots on target" },
  { id: "foulsCommitted", label: "Fouls committed" },
  { id: "foulsWon", label: "Fouls won" },
  { id: "tackles", label: "Tackles" },
  { id: "yellows", label: "Yellow cards" },
] as const;

type PlayerStat = (typeof PLAYER_PILLS)[number]["id"];

type TeamGoals = {
  teamId: number;
  team: string;
  logo: string | null;
  played: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalsDiff: number | null;
  xg: number | null;
  homeXg: number | null;
  awayXg: number | null;
  xc: number | null;
  homeXc: number | null;
  awayXc: number | null;
  corners: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
};

export default function SeasonStats({ season, players, teams }: { season: number; players: SeasonPlayer[]; teams: TeamGoals[] }) {
  const [tab, setTab] = useState<"players" | "teams">("players");
  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Season totals</h2>
          <p className="text-sm text-gray-500">{season}. Player counts, and team averages from stored match sheets.</p>
        </div>
        <div className="flex rounded-full bg-gray-100 p-1">
          <button type="button" onClick={() => setTab("players")} className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === "players" ? "bg-blue-600 text-white" : "text-gray-600"}`}>
            Players
          </button>
          <button type="button" onClick={() => setTab("teams")} className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === "teams" ? "bg-blue-600 text-white" : "text-gray-600"}`}>
            Teams
          </button>
        </div>
      </div>
      {tab === "players" ? <PlayerTable players={players} season={season} /> : <TeamTable teams={teams} players={players} season={season} />}
    </section>
  );
}

function PlayerTable({ players, season }: { players: SeasonPlayer[]; season: number }) {
  const [stat, setStat] = useState<PlayerStat>("goals");
  const [open, setOpen] = useState(false);
  const { sortKey, sortDir, toggle, reset } = useColumnSort<"apps" | "mins" | "stat">("stat", "desc");
  if (players.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        Player totals are not stored for {season} (player_season_stats).
      </p>
    );
  }
  const ranked = [...players].sort((left, right) => {
    const key = sortKey ?? "stat";
    const dir = sortDir === "asc" ? 1 : -1;
    const a = key === "apps" ? left.apps : key === "mins" ? left.minutes : left[stat];
    const b = key === "apps" ? right.apps : key === "mins" ? right.minutes : right[stat];
    const av = a ?? -1;
    const bv = b ?? -1;
    if (av !== bv) return (av - bv) * dir;
    return left.name.localeCompare(right.name);
  });
  const shown = open ? ranked : ranked.slice(0, PREVIEW);
  const label = PLAYER_PILLS.find((pill) => pill.id === stat)?.label ?? "Total";
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {PLAYER_PILLS.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => {
              setStat(pill.id);
              reset();
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.id === stat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {pill.label}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr>
              <LabeledTh label="#" fullName="Rank" className="pr-2" />
              <LabeledTh label="Player" />
              <SortableTh label="Apps" fullName="Appearances" active={sortKey === "apps"} dir={sortDir} onSort={() => toggle("apps")} />
              <SortableTh label="Mins" fullName="Minutes played" active={sortKey === "mins"} dir={sortDir} onSort={() => toggle("mins")} />
              <SortableTh label={label} fullName={label} active={sortKey === "stat"} dir={sortDir} onSort={() => toggle("stat")} />
            </tr>
          </thead>
          <tbody>
            {shown.map((player, index) => (
              <tr key={player.id} className="border-t border-gray-100">
                <td className="py-2 pr-2 text-gray-500">{index + 1}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    {player.photo ? <img src={player.photo} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="h-7 w-7 rounded-full bg-blue-50" />}
                    <span>
                      <span className="block font-medium text-slate-900">{player.name}</span>
                      <span className="block text-xs text-gray-500">{player.team}</span>
                    </span>
                  </span>
                </td>
                <td className="py-2 text-right">{cell(player.apps)}</td>
                <td className="py-2 text-right">{cell(player.minutes)}</td>
                <td className="py-2 text-right font-semibold text-blue-600">{cell(player[stat])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ShowAll count={ranked.length} open={open} onToggle={() => setOpen((value) => !value)} />
    </div>
  );
}

type TeamSortKey =
  | "played"
  | "gf"
  | "ga"
  | "gd"
  | "xg"
  | "xgH"
  | "xgA"
  | "xc"
  | "xcH"
  | "xcA"
  | "cornersH"
  | "cornersA"
  | "corners";

function TeamTable({ teams, players, season }: { teams: TeamGoals[]; players: SeasonPlayer[]; season: number }) {
  const [advanced, setAdvanced] = useState(false);
  const [open, setOpen] = useState(false);
  const { sortKey, sortDir, toggle } = useColumnSort<TeamSortKey>("gf", "desc");
  const ranked = useMemo(() => {
    if (sortKey == null) return teams;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...teams].sort((left, right) => {
      const a = teamSortValue(left, sortKey);
      const b = teamSortValue(right, sortKey);
      if (a == null && b == null) return left.team.localeCompare(right.team);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return left.team.localeCompare(right.team);
    });
  }, [teams, sortKey, sortDir]);
  if (teams.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        Team totals are not stored for {season} (standings / player_season_stats).
      </p>
    );
  }
  const shown = open ? ranked : ranked.slice(0, PREVIEW);
  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr>
              <LabeledTh label="#" fullName="Rank" className="pr-2" />
              <LabeledTh label="Team" />
              <SortableTh label="P" fullName="Played (matches)" active={sortKey === "played"} dir={sortDir} onSort={() => toggle("played")} />
              <SortableTh label="GF" fullName="Goals for" active={sortKey === "gf"} dir={sortDir} onSort={() => toggle("gf")} />
              <SortableTh label="GA" fullName="Goals against" active={sortKey === "ga"} dir={sortDir} onSort={() => toggle("ga", true)} />
              <SortableTh label="GD" fullName="Goal difference" active={sortKey === "gd"} dir={sortDir} onSort={() => toggle("gd")} />
              <SortableTh label="xG" fullName="Expected goals per game" active={sortKey === "xg"} dir={sortDir} onSort={() => toggle("xg")} />
              <SortableTh label="xG H" fullName="Expected goals per game (home)" active={sortKey === "xgH"} dir={sortDir} onSort={() => toggle("xgH")} />
              <SortableTh label="xG A" fullName="Expected goals per game (away)" active={sortKey === "xgA"} dir={sortDir} onSort={() => toggle("xgA")} />
              <SortableTh label="xC" fullName="Expected goals conceded per game" active={sortKey === "xc"} dir={sortDir} onSort={() => toggle("xc", true)} />
              <SortableTh label="xC H" fullName="Expected goals conceded per game (home)" active={sortKey === "xcH"} dir={sortDir} onSort={() => toggle("xcH", true)} />
              <SortableTh label="xC A" fullName="Expected goals conceded per game (away)" active={sortKey === "xcA"} dir={sortDir} onSort={() => toggle("xcA", true)} />
              <SortableTh label="Corners H" fullName="Corners per game (home)" active={sortKey === "cornersH"} dir={sortDir} onSort={() => toggle("cornersH")} />
              <SortableTh label="Corners A" fullName="Corners per game (away)" active={sortKey === "cornersA"} dir={sortDir} onSort={() => toggle("cornersA")} />
              <SortableTh label="Corners" fullName="Corners per game" active={sortKey === "corners"} dir={sortDir} onSort={() => toggle("corners")} />
              {advanced ? (
                <>
                  <LabeledTh label="Shots" fullName="Total shots (player season sum)" align="right" />
                  <LabeledTh label="SOT" fullName="Shots on target (player season sum)" align="right" />
                  <LabeledTh label="Fouls committed" align="right" />
                  <LabeledTh label="Fouls won" fullName="Fouls won (drawn)" align="right" />
                  <LabeledTh label="Tackles" align="right" />
                  <LabeledTh label="Yellows" fullName="Yellow cards" align="right" />
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((team, index) => {
              const sums = advanced ? teamSums(players, team.teamId) : null;
              return (
                <tr key={team.teamId} className="border-t border-gray-100">
                  <td className="py-2 pr-2 text-gray-500">{index + 1}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      {team.logo ? <img src={team.logo} alt="" className="h-5 w-5 object-contain" /> : null}
                      {team.team}
                    </span>
                  </td>
                  <td className="py-2 text-right">{cell(team.played)}</td>
                  <td className="py-2 text-right font-semibold text-blue-600">{cell(team.goalsFor)}</td>
                  <td className="py-2 text-right">{cell(team.goalsAgainst)}</td>
                  <td className="py-2 text-right">{cell(team.goalsDiff)}</td>
                  <td className="py-2 text-right font-semibold text-blue-600">{decimal(team.xg)}</td>
                  <td className="py-2 text-right">{decimal(team.homeXg)}</td>
                  <td className="py-2 text-right">{decimal(team.awayXg)}</td>
                  <td className="py-2 text-right">{decimal(team.xc)}</td>
                  <td className="py-2 text-right">{decimal(team.homeXc)}</td>
                  <td className="py-2 text-right">{decimal(team.awayXc)}</td>
                  <td className="py-2 text-right">{decimal(team.homeCorners)}</td>
                  <td className="py-2 text-right">{decimal(team.awayCorners)}</td>
                  <td className="py-2 text-right">{decimal(team.corners)}</td>
                  {sums ? (
                    <>
                      <td className="py-2 text-right">{cell(sums.shots)}</td>
                      <td className="py-2 text-right">{cell(sums.shotsOn)}</td>
                      <td className="py-2 text-right">{cell(sums.foulsCommitted)}</td>
                      <td className="py-2 text-right">{cell(sums.foulsWon)}</td>
                      <td className="py-2 text-right">{cell(sums.tackles)}</td>
                      <td className="py-2 text-right">{cell(sums.yellows)}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        xG is expected goals per game. xC is expected goals conceded per game. Corner columns are home, away, and overall averages.
        {advanced ? " Shot, foul, tackle and yellow totals are summed from stored player seasons." : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdvanced((value) => !value)} className="rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-blue-600">
          {advanced ? "Hide advanced stats" : "Show advanced stats"}
        </button>
        <ShowAll count={teams.length} open={open} onToggle={() => setOpen((value) => !value)} />
      </div>
    </div>
  );
}

function teamSortValue(team: TeamGoals, key: TeamSortKey): number | null {
  switch (key) {
    case "played":
      return team.played;
    case "gf":
      return team.goalsFor;
    case "ga":
      return team.goalsAgainst;
    case "gd":
      return team.goalsDiff;
    case "xg":
      return team.xg;
    case "xgH":
      return team.homeXg;
    case "xgA":
      return team.awayXg;
    case "xc":
      return team.xc;
    case "xcH":
      return team.homeXc;
    case "xcA":
      return team.awayXc;
    case "cornersH":
      return team.homeCorners;
    case "cornersA":
      return team.awayCorners;
    case "corners":
      return team.corners;
  }
}

export function BttsList({ rows }: { rows: Array<{ teamId: number; team: string; logo: string | null; last5: boolean[]; hits: string | null; homePct: number | null; awayPct: number | null; seasonPct: number | null; nextOpponent: string | null; nextOdd: string | null }> }) {
  const [open, setOpen] = useState(false);
  const { sortKey, sortDir, toggle } = useColumnSort<"home" | "away" | "season">("season", "desc");
  const ranked = useMemo(() => {
    if (sortKey == null) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = sortKey === "home" ? left.homePct : sortKey === "away" ? left.awayPct : left.seasonPct;
      const b = sortKey === "home" ? right.homePct : sortKey === "away" ? right.awayPct : right.seasonPct;
      if (a == null && b == null) return left.team.localeCompare(right.team);
      if (a == null) return 1;
      if (b == null) return -1;
      if (a !== b) return (a - b) * dir;
      return left.team.localeCompare(right.team);
    });
  }, [rows, sortKey, sortDir]);
  const shown = open ? ranked : ranked.slice(0, PREVIEW);
  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr>
              <LabeledTh label="#" fullName="Rank" />
              <LabeledTh label="Team" />
              <LabeledTh label="Last 5" fullName="Last five both-teams-to-score results" />
              <LabeledTh label="Hits" fullName="Both teams to score hits this season" align="right" />
              <SortableTh label="Home" fullName="Home both-teams-to-score rate" active={sortKey === "home"} dir={sortDir} onSort={() => toggle("home")} />
              <SortableTh label="Away" fullName="Away both-teams-to-score rate" active={sortKey === "away"} dir={sortDir} onSort={() => toggle("away")} />
              <SortableTh label="Season" fullName="Season both-teams-to-score rate" active={sortKey === "season"} dir={sortDir} onSort={() => toggle("season")} />
              <LabeledTh label="Next" fullName="Next opponent" />
              <LabeledTh label="Yes" fullName="Both teams to score — Yes odds" align="right" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.teamId} className="border-t border-gray-100">
                <td className="py-2 text-gray-500">{index + 1}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2 font-medium">
                    {row.logo ? <img src={row.logo} alt="" className="h-5 w-5 object-contain" /> : null}
                    {row.team}
                  </span>
                </td>
                <td className="py-2">
                  <span className="flex gap-1">
                    {row.last5.map((hit, mark) => (
                      <span key={`${row.teamId}-${mark}`} className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold ${hit ? "bg-blue-600 text-white" : "bg-slate-900 text-white"}`}>{hit ? "Y" : "N"}</span>
                    ))}
                  </span>
                </td>
                <td className="py-2 text-right">{row.hits ?? "–"}</td>
                <td className="py-2 text-right">{row.homePct == null ? "–" : `${row.homePct}%`}</td>
                <td className="py-2 text-right">{row.awayPct == null ? "–" : `${row.awayPct}%`}</td>
                <td className="py-2 text-right font-semibold text-blue-600">{row.seasonPct == null ? "–" : `${row.seasonPct}%`}</td>
                <td className="py-2 text-gray-500">{row.nextOpponent ?? "–"}</td>
                <td className="py-2 text-right font-semibold text-blue-600">{row.nextOdd ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ShowAll count={rows.length} open={open} onToggle={() => setOpen((value) => !value)} />
    </>
  );
}

function ShowAll({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count <= PREVIEW) return null;
  return (
    <button type="button" onClick={onToggle} className="mt-3 text-sm font-semibold text-blue-600">
      {open ? "Show less" : "Show all"}
    </button>
  );
}

function teamSums(players: SeasonPlayer[], teamId: number) {
  const rows = players.filter((player) => player.teamId === teamId);
  return {
    shots: sum(rows, "shots"),
    shotsOn: sum(rows, "shotsOn"),
    foulsCommitted: sum(rows, "foulsCommitted"),
    foulsWon: sum(rows, "foulsWon"),
    tackles: sum(rows, "tackles"),
    yellows: sum(rows, "yellows"),
  };
}

function sum(rows: SeasonPlayer[], key: "shots" | "shotsOn" | "foulsCommitted" | "foulsWon" | "tackles" | "yellows") {
  const values = rows.map((row) => row[key]).filter((value): value is number => value != null);
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0);
}

function cell(value: number | null) {
  return value === null ? "–" : value;
}

function decimal(value: number | null) {
  return value === null ? "–" : value.toFixed(2);
}
