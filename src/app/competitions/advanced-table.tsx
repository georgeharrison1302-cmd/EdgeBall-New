"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { HitRateStrip } from "@/components/stats/HitRateStrip";
import { LensPills } from "@/components/stats/LensPills";
import {
  LabeledTh,
  SortableTh,
  useColumnSort,
} from "@/components/stats/SortableStatHeader";

import type { StandingRow } from "./data";
import type { SideTotals, StandingsLensRow } from "./standings-load";
import { count, Form, zoneClass } from "./ui";

type Lens = "standard" | "discipline" | "attacking" | "homeaway";
type Venue = "overall" | "home" | "away";
type SortKey =
  | "played"
  | "win"
  | "draw"
  | "lose"
  | "gf"
  | "ga"
  | "gd"
  | "pts"
  | "cards"
  | "yellows"
  | "reds"
  | "goalsPerGame"
  | "cleanSheets"
  | "btts";

const LENSES: Array<{ id: Lens; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "discipline", label: "Discipline & Cards" },
  { id: "attacking", label: "Attacking & Goals" },
  { id: "homeaway", label: "Home / Away" },
];

/**
 * Multi-lens standings table with betting accordion.
 * Data comes from loadStandingsLenses — never invents rates or odds.
 */
export default function AdvancedTable({
  leagueId,
  season,
  groups,
  lenses,
}: {
  leagueId: number;
  season: number;
  groups: Array<{ name: string; rows: StandingRow[] }>;
  lenses: Map<number, StandingsLensRow> | Record<number, StandingsLensRow>;
}) {
  const [lens, setLens] = useState<Lens>("standard");
  const [venue, setVenue] = useState<Venue>("overall");
  const [openId, setOpenId] = useState<number | null>(null);
  const { sortKey, sortDir, toggle, reset } = useColumnSort<SortKey>(null, "desc");
  const lookup = useMemo(
    () =>
      lenses instanceof Map
        ? lenses
        : new Map(Object.entries(lenses).map(([id, row]) => [Number(id), row])),
    [lenses],
  );

  function changeLens(next: Lens) {
    setLens(next);
    reset();
  }
  function changeVenue(next: Venue) {
    setVenue(next);
    reset();
  }

  return (
    <section className="mt-6 space-y-4">
      <LensPills options={LENSES} current={lens} onChange={changeLens} />
      {lens === "homeaway" ? (
        <LensPills
          options={[
            { id: "overall", label: "Overall" },
            { id: "home", label: "Home" },
            { id: "away", label: "Away" },
          ]}
          current={venue}
          onChange={changeVenue}
        />
      ) : null}
      {groups.map((group) => {
        const base = sortRowsForLens(group.rows, lookup, lens, venue);
        const rows = applyColumnSort(base, lookup, lens, venue, sortKey, sortDir);
        const showLeagueRank =
          sortKey == null && (lens === "standard" || (lens === "homeaway" && venue === "overall"));
        return (
          <div key={group.name || "table"}>
            {group.name && groups.length > 1 ? (
              <h2 className="mb-3 text-lg font-semibold text-[#0f172a]">{group.name}</h2>
            ) : null}
            <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <LabeledTh label="#" fullName="Table position" className="px-3" />
                    <LabeledTh label="Team" className="px-3" />
                    {lens === "discipline" ? (
                      <>
                        <SortableTh
                          label="Cards/g"
                          fullName="Cards per game (yellow + red)"
                          active={sortKey === "cards"}
                          dir={sortDir}
                          onSort={() => toggle("cards")}
                          className="px-2"
                        />
                        <SortableTh
                          label="Total Yellows"
                          fullName="Total yellow cards"
                          active={sortKey === "yellows"}
                          dir={sortDir}
                          onSort={() => toggle("yellows")}
                          className="px-2"
                        />
                        <SortableTh
                          label="Red Cards"
                          fullName="Red cards"
                          active={sortKey === "reds"}
                          dir={sortDir}
                          onSort={() => toggle("reds")}
                          className="px-2"
                        />
                        <LabeledTh label="Top Disciplinary Player" fullName="Highest yellow / foul player" className="px-3" />
                      </>
                    ) : lens === "attacking" ? (
                      <>
                        <SortableTh
                          label="Goals/g"
                          fullName="Goals scored per game"
                          active={sortKey === "goalsPerGame"}
                          dir={sortDir}
                          onSort={() => toggle("goalsPerGame")}
                          className="px-2"
                        />
                        <SortableTh
                          label="Clean Sheets"
                          fullName="Clean sheets"
                          active={sortKey === "cleanSheets"}
                          dir={sortDir}
                          onSort={() => toggle("cleanSheets")}
                          className="px-2"
                        />
                        <SortableTh
                          label="BTTS Rate"
                          fullName="Both teams to score rate"
                          active={sortKey === "btts"}
                          dir={sortDir}
                          onSort={() => toggle("btts")}
                          className="px-2"
                        />
                      </>
                    ) : (
                      <>
                        <SortableTh label="P" fullName="Played (matches)" active={sortKey === "played"} dir={sortDir} onSort={() => toggle("played")} className="px-2" />
                        <SortableTh label="W" fullName="Wins" active={sortKey === "win"} dir={sortDir} onSort={() => toggle("win")} className="px-2" />
                        <SortableTh label="D" fullName="Draws" active={sortKey === "draw"} dir={sortDir} onSort={() => toggle("draw")} className="px-2" />
                        <SortableTh label="L" fullName="Losses" active={sortKey === "lose"} dir={sortDir} onSort={() => toggle("lose")} className="px-2" />
                        <SortableTh label="GF" fullName="Goals for" active={sortKey === "gf"} dir={sortDir} onSort={() => toggle("gf")} className="px-2" />
                        <SortableTh label="GA" fullName="Goals against" active={sortKey === "ga"} dir={sortDir} onSort={() => toggle("ga", true)} className="px-2" />
                        <SortableTh label="GD" fullName="Goal difference" active={sortKey === "gd"} dir={sortDir} onSort={() => toggle("gd")} className="px-2" />
                        <SortableTh label="Pts" fullName="Points" active={sortKey === "pts"} dir={sortDir} onSort={() => toggle("pts")} className="px-2" />
                        <LabeledTh label="Form" fullName="Recent form (last five results)" className="px-3" />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const extra = lookup.get(row.teamId);
                    const side = extra
                      ? lens === "homeaway"
                        ? extra[venue]
                        : extra.overall
                      : fallbackSide(row);
                    const open = openId === row.teamId;
                    return (
                      <StandingRowBlock
                        key={`${group.name}-${row.teamId}`}
                        leagueId={leagueId}
                        season={season}
                        row={row}
                        extra={extra}
                        side={side}
                        lens={lens}
                        position={index + 1}
                        showLeagueRank={showLeagueRank}
                        open={open}
                        onToggle={() => setOpenId(open ? null : row.teamId)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function applyColumnSort(
  rows: StandingRow[],
  lookup: Map<number, StandingsLensRow>,
  lens: Lens,
  venue: Venue,
  sortKey: SortKey | null,
  sortDir: "asc" | "desc",
) {
  if (sortKey == null) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = standingSortValue(left, lookup, lens, venue, sortKey);
    const b = standingSortValue(right, lookup, lens, venue, sortKey);
    if (a == null && b == null) return left.team.localeCompare(right.team);
    if (a == null) return 1;
    if (b == null) return -1;
    if (a !== b) return (a - b) * dir;
    return left.team.localeCompare(right.team);
  });
}

function standingSortValue(
  row: StandingRow,
  lookup: Map<number, StandingsLensRow>,
  lens: Lens,
  venue: Venue,
  key: SortKey,
): number | null {
  const extra = lookup.get(row.teamId);
  const side =
    lens === "homeaway" ? (extra?.[venue] ?? fallbackSide(row)) : (extra?.overall ?? fallbackSide(row));
  switch (key) {
    case "played":
      return side.played;
    case "win":
      return side.win;
    case "draw":
      return side.draw;
    case "lose":
      return side.lose;
    case "gf":
      return side.goalsFor;
    case "ga":
      return side.goalsAgainst;
    case "gd":
      return side.goalsDiff;
    case "pts":
      return side.points;
    case "cards":
      return extra?.cardsPerGame ?? null;
    case "yellows":
      return extra?.totalYellows ?? null;
    case "reds":
      return extra?.reds ?? null;
    case "goalsPerGame":
      return extra?.gfPerGame ?? null;
    case "cleanSheets":
      return extra?.cleanSheets ?? null;
    case "btts":
      return extra?.bttsPct ?? null;
  }
}

function sortRowsForLens(
  rows: StandingRow[],
  lookup: Map<number, StandingsLensRow>,
  lens: Lens,
  venue: Venue,
) {
  const decorated = rows.map((row) => {
    const extra = lookup.get(row.teamId);
    const side =
      lens === "homeaway"
        ? (extra?.[venue] ?? fallbackSide(row))
        : (extra?.overall ?? fallbackSide(row));
    return { row, extra, side };
  });

  decorated.sort((left, right) => {
    if (lens === "discipline") {
      return (
        numDesc(left.extra?.cardsPerGame, right.extra?.cardsPerGame) ||
        numDesc(left.extra?.totalYellows, right.extra?.totalYellows) ||
        left.row.team.localeCompare(right.row.team)
      );
    }
    if (lens === "attacking") {
      return (
        numDesc(left.extra?.gfPerGame, right.extra?.gfPerGame) ||
        numDesc(left.extra?.bttsPct, right.extra?.bttsPct) ||
        numDesc(left.extra?.cleanSheets, right.extra?.cleanSheets) ||
        left.row.team.localeCompare(right.row.team)
      );
    }
    // Standard + Home/Away: classic table order for the active side.
    return (
      numDesc(left.side.points, right.side.points) ||
      numDesc(left.side.goalsDiff, right.side.goalsDiff) ||
      numDesc(left.side.goalsFor, right.side.goalsFor) ||
      left.row.team.localeCompare(right.row.team)
    );
  });

  return decorated.map((item) => item.row);
}

function numDesc(left: number | null | undefined, right: number | null | undefined) {
  const a = left == null || !Number.isFinite(left) ? Number.NEGATIVE_INFINITY : left;
  const b = right == null || !Number.isFinite(right) ? Number.NEGATIVE_INFINITY : right;
  return b - a;
}

function StandingRowBlock({
  leagueId,
  season,
  row,
  extra,
  side,
  lens,
  position,
  showLeagueRank,
  open,
  onToggle,
}: {
  leagueId: number;
  season: number;
  row: StandingRow;
  extra: StandingsLensRow | undefined;
  side: SideTotals;
  lens: Lens;
  position: number;
  showLeagueRank: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const colSpan =
    lens === "discipline" ? 7 : lens === "attacking" ? 6 : 12;

  return (
    <>
      <tr
        className={`cursor-pointer border-t border-[#e2e8f0] ${zoneClass(row.description)} ${
          open ? "bg-[#f8fafc]" : "hover:bg-[#f8fafc]"
        }`}
        onClick={onToggle}
        title={row.description ?? extra?.narrative}
      >
        <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Hide ${row.team} angles` : `Show ${row.team} angles`}
            className="grid h-6 w-6 place-items-center rounded-full border border-[#e2e8f0] text-xs font-semibold text-[#64748b]"
          >
            {open ? "–" : "+"}
          </button>
        </td>
        <td className="px-3 py-3 text-[#0f172a]">
          {showLeagueRank && row.movement === "up" ? (
            <span className="text-green-700">↑ </span>
          ) : null}
          {showLeagueRank && row.movement === "down" ? (
            <span className="text-red-700">↓ </span>
          ) : null}
          {showLeagueRank ? count(row.rank) : position}
        </td>
        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
          <Link
            href={`/competitions/${leagueId}/teams/${row.teamId}?season=${season}`}
            className="flex items-center gap-2 font-semibold text-[#0f172a]"
          >
            {row.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.logoUrl} alt="" className="h-5 w-5 object-contain" />
            ) : null}
            <span>{row.team}</span>
          </Link>
        </td>
        {lens === "discipline" ? (
          <>
            <td className="px-2 py-3 text-right text-[#0f172a]">{rate(extra?.cardsPerGame)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(extra?.totalYellows ?? null)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(extra?.reds ?? null)}</td>
            <td className="px-3 py-3 text-[#334155]">
              {extra?.topYellow
                ? `${extra.topYellow.name} (${extra.topYellow.yellows})`
                : "—"}
            </td>
          </>
        ) : lens === "attacking" ? (
          <>
            <td className="px-2 py-3 text-right text-[#0f172a]">{rate(extra?.gfPerGame)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(extra?.cleanSheets ?? null)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{pct(extra?.bttsPct ?? null)}</td>
          </>
        ) : (
          <>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.played)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.win)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.draw)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.lose)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.goalsFor)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.goalsAgainst)}</td>
            <td className="px-2 py-3 text-right text-[#0f172a]">{count(side.goalsDiff)}</td>
            <td className="px-2 py-3 text-right font-semibold text-[#0f172a]">{count(side.points)}</td>
            <td className="px-3 py-3">
              <Form value={row.form} />
            </td>
          </>
        )}
      </tr>
      {open ? (
        <tr className="border-t border-[#e2e8f0] bg-[#f8fafc]">
          <td colSpan={colSpan} className="px-4 py-4">
            <AccordionBody leagueId={leagueId} season={season} extra={extra} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AccordionBody({
  leagueId,
  season,
  extra,
}: {
  leagueId: number;
  season: number;
  extra: StandingsLensRow | undefined;
}) {
  if (!extra) {
    return (
      <p className="text-sm text-[#64748b]">
        Team angles are not stored yet — Last-5 form and sheet rates are empty for this club.
      </p>
    );
  }

  const bttsRate =
    extra.bttsPct != null
      ? `${Math.round(extra.bttsPct)}%`
      : extra.bttsLast5.length > 0
        ? `${extra.bttsLast5.filter(Boolean).length}/${extra.bttsLast5.length}`
        : null;
  const narrative =
    extra.narrative ||
    [
      extra.nextOpponent ? `Next: vs ${extra.nextOpponent}` : null,
      bttsRate ? `BTTS ${bttsRate}` : null,
      extra.yellowsPerGame != null ? `Yellows ${extra.yellowsPerGame.toFixed(1)}/g` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3">
        <p className="text-sm font-semibold text-[#0f172a]">
          {narrative || "Next fixture and team rates are not stored yet."}
        </p>
        {extra.nextFixtureId ? (
          <Link
            href={`/fixtures/${extra.nextFixtureId}`}
            className="mt-3 inline-flex rounded-full bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Open Match Hub
          </Link>
        ) : (
          <p className="mt-2 text-xs text-[#64748b]">No upcoming fixture stored for Match Hub.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
            Discipline leaders
          </p>
          {extra.leaders.length === 0 ? (
            <p className="mt-2 text-sm text-[#64748b]">No stored card leaders.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {extra.leaders.map((leader) => (
                <li key={leader.playerId}>
                  <Link
                    href={`/competitions/${leagueId}/players/${leader.playerId}?season=${season}`}
                    className="font-semibold text-[#2563eb]"
                  >
                    {leader.name}
                  </Link>
                  <span className="text-[#64748b]">
                    {" "}
                    · {leader.yellows} yellows
                    {leader.fouls != null ? ` · ${leader.fouls} fouls` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">BTTS</p>
          <p className="mt-2 text-sm font-semibold text-[#0f172a]">
            {extra.bttsPct == null ? "BTTS is not stored." : `${extra.bttsPct}% this season`}
          </p>
          <div className="mt-2">
            <HitRateStrip values={extra.bttsLast5} thresholdLabel="BTTS" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
            Clean sheets
          </p>
          <p className="mt-2 text-sm font-semibold text-[#0f172a]">
            {extra.cleanSheets == null
              ? "Clean sheets are not stored."
              : `${extra.cleanSheets} this season`}
          </p>
          {extra.cardsPerGame != null ? (
            <p className="mt-2 text-xs text-[#64748b]">
              {extra.cardsPerGame.toFixed(2)} cards/g ·{" "}
              {extra.totalYellows ?? 0} yellows · {extra.reds ?? 0} reds
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function fallbackSide(row: StandingRow): SideTotals {
  return {
    played: row.played,
    win: row.win,
    draw: row.draw,
    lose: row.lose,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalsDiff: row.goalsDiff,
    points: row.points,
  };
}

function rate(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function pct(value: number | null) {
  return value == null ? "—" : `${Math.round(value)}%`;
}
