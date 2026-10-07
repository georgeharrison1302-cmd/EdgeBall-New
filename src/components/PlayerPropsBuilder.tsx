"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PlayerHeadshot } from "@/components/assets";
import { MatchupBadges } from "@/components/Media";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { FormDots } from "@/components/stats/FormDots";
import { HitRateBar } from "@/components/stats/HitRateBar";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { SeasonProofBadges } from "@/components/stats/SeasonProofBadges";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";
import { isPriced } from "@/components/stats/types";
import {
  deskForm,
  defaultThresholdForStat,
  DESK_STAT_MARKETS,
  parseDeskStatParam,
  selectionClearLine,
  statLabel,
  thresholdsForStat,
  type DeskFormMetrics,
  type DeskStat,
} from "@/lib/stats/prop-desk";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";

type Market =
  | "Shots on Target"
  | "Total Shots"
  | "To Be Carded"
  | "Fouls Committed"
  | "Fouls Drawn"
  | "Tackles"
  | "GK Saves";

export type PlayerProp = {
  id: number;
  competition: string;
  player: string;
  match: string;
  playerImg: string;
  homeTeamImg: string;
  awayTeamImg: string;
  selection: string;
  market: Market;
  odds: number | null;
  hitRate: number;
  edgeScore: number;
  /** Integer clear line from selection (1 for 0.5+, 2 for 1.5+, …). */
  line?: number | null;
  fixtureId?: number | null;
  foulsPerGame?: number;
  foulsDrawnPerGame?: number;
  foulsPer90?: number | null;
  tacklesPer90?: number | null;
  appearances?: number | null;
  yellows?: number | null;
  goals?: number | null;
  position?: string | null;
  playerId?: number;
  form?: Array<boolean | null>;
  /** Oldest → newest raw counts from fixture_player_statistics. */
  formCounts?: number[];
  formHitPct?: number | null;
  formAvg?: number | null;
  /** Integer clear line used for formHits / Last-5 boxes. */
  formThreshold?: number;
  sotForm?: Array<boolean | null>;
  seasonSotPer90?: number | null;
  modelProb?: number | null;
  edgePct?: number | null;
  clash?: { playerRate: number; opponentRate: number; label: string } | null;
  strictRef?: { name: string; avg: number; vsLeaguePct: number | null } | null;
  highFoulSide?: boolean;
  breakdown?: import("@/app/competitions/match-types").MatchLogRow[];
};

type SortKey = "hit" | "edge" | "odds";

type DeskRow = {
  key: string;
  player: string;
  playerImg: string;
  position: string | null;
  match: string;
  competition: string;
  homeTeamImg: string;
  awayTeamImg: string;
  playerId?: number;
  form: DeskFormMetrics;
  priced: PlayerProp | null;
  sample: PlayerProp;
};

type CompNode = {
  name: string;
  matches: string[];
};

/**
 * Statz-style Prop Desk — sidebar filters + empirical last-5 results table.
 */
export default function PlayerPropsBuilder({
  matchFilter,
  props,
  oddsPayload: _oddsPayload,
  showTopAngles: _showTopAngles = true,
}: {
  matchFilter?: string;
  props?: PlayerProp[];
  oddsPayload?: unknown;
  /** Unused on desk (best-picks chips replace the carousel). */
  showTopAngles?: boolean;
}) {
  const slip = useBetSlip();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = props ?? [];
  const slim = Boolean(matchFilter);

  const [stat, setStat] = useState<DeskStat>(() => parseDeskStatParam(searchParams.get("stat")));
  const [threshold, setThreshold] = useState(() => {
    const raw = Number(searchParams.get("threshold"));
    if (Number.isInteger(raw) && raw > 0) return raw;
    return defaultThresholdForStat(parseDeskStatParam(searchParams.get("stat")));
  });
  const [hitRateMin, setHitRateMin] = useState(() => {
    const raw = Number(searchParams.get("hitrate"));
    return Number.isFinite(raw) && raw >= 0 ? Math.min(100, Math.max(0, raw)) : 60;
  });
  const [oddsOnly, setOddsOnly] = useState(() => searchParams.get("oddsonly") !== "0");
  const [sort, setSort] = useState<SortKey>("hit");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [enabledComps, setEnabledComps] = useState<Set<string>>(() => new Set());
  const [enabledMatches, setEnabledMatches] = useState<Set<string>>(() => new Set());
  const [expandedComps, setExpandedComps] = useState<Set<string>>(() => new Set());
  const [filtersReady, setFiltersReady] = useState(false);

  const market = DESK_STAT_MARKETS.find((row) => row.id === stat)?.market ?? "Fouls Committed";
  const thresholdOptions = thresholdsForStat(stat);

  const pool = useMemo(() => {
    if (!matchFilter) return source;
    return source.filter((prop) => prop.match === matchFilter);
  }, [source, matchFilter]);

  const competitions = useMemo(() => buildCompetitions(pool), [pool]);

  useEffect(() => {
    if (filtersReady) return;
    const fromUrl = (searchParams.get("comp") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const comps = new Set<string>();
    const matches = new Set<string>();
    for (const node of competitions) {
      if (node.matches.length === 0) continue;
      const on = fromUrl.length === 0 || fromUrl.includes(node.name);
      if (on) {
        comps.add(node.name);
        for (const match of node.matches) matches.add(match);
      }
    }
    setEnabledComps(comps);
    setEnabledMatches(matches);
    setFiltersReady(true);
  }, [competitions, filtersReady, searchParams]);

  useEffect(() => {
    if (!thresholdOptions.includes(threshold)) {
      setThreshold(defaultThresholdForStat(stat));
    }
  }, [stat, threshold, thresholdOptions]);

  const syncUrl = useCallback(
    (next: {
      stat?: DeskStat;
      threshold?: number;
      hitrate?: number;
      oddsonly?: boolean;
      comps?: Set<string>;
    }) => {
      if (slim) return;
      const params = new URLSearchParams(searchParams.toString());
      const nextStat = next.stat ?? stat;
      const nextThr = next.threshold ?? threshold;
      const nextHr = next.hitrate ?? hitRateMin;
      const nextOdds = next.oddsonly ?? oddsOnly;
      const nextComps = next.comps ?? enabledComps;
      params.set("stat", nextStat);
      params.set("threshold", String(nextThr));
      params.set("hitrate", String(nextHr));
      params.set("oddsonly", nextOdds ? "1" : "0");
      if (nextComps.size > 0 && nextComps.size < competitions.filter((c) => c.matches.length > 0).length) {
        params.set("comp", [...nextComps].join(","));
      } else {
        params.delete("comp");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [
      competitions,
      enabledComps,
      hitRateMin,
      oddsOnly,
      pathname,
      router,
      searchParams,
      slim,
      stat,
      threshold,
    ],
  );

  const pricedLinesForStat = useMemo(() => {
    const lines = new Set<number>();
    for (const prop of pool) {
      if (prop.market !== market) continue;
      if (!isPriced(prop.odds)) continue;
      const line = prop.line ?? selectionClearLine(prop.selection) ?? (prop.market === "To Be Carded" ? 1 : null);
      if (line != null) lines.add(line);
    }
    return lines;
  }, [pool, market]);

  const bestPicks = useMemo(() => {
    return DESK_STAT_MARKETS.map((row) => {
      const n = pool.filter((prop) => prop.market === row.market && isPriced(prop.odds)).length;
      return { ...row, n };
    })
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
  }, [pool]);

  const deskRows = useMemo(() => {
    const byPlayer = new Map<string, PlayerProp[]>();
    for (const prop of pool) {
      if (prop.market !== market) continue;
      if (!slim && filtersReady) {
        if (!enabledComps.has(prop.competition)) continue;
        if (!enabledMatches.has(prop.match)) continue;
      }
      const key = `${prop.playerId ?? prop.player}::${prop.match}::${prop.market}`;
      const list = byPlayer.get(key) ?? [];
      list.push(prop);
      byPlayer.set(key, list);
    }

    const rows: DeskRow[] = [];
    for (const [key, group] of byPlayer) {
      const sample = group[0]!;
      const form = deskForm(sample.breakdown, threshold, stat);
      if (form.hitPct == null) {
        // Still show when season proof exists but no logs — filter below if odds-only.
      } else if (form.hitPct < hitRateMin) {
        continue;
      }

      const priced =
        group.find((prop) => {
          const line = prop.line ?? selectionClearLine(prop.selection) ?? (prop.market === "To Be Carded" ? 1 : null);
          return line === threshold && isPriced(prop.odds);
        }) ?? null;

      if (oddsOnly && !priced) continue;
      if (form.hitPct == null && !priced) continue;

      rows.push({
        key,
        player: sample.player,
        playerImg: sample.playerImg,
        position: sample.position ?? null,
        match: sample.match,
        competition: sample.competition,
        homeTeamImg: sample.homeTeamImg,
        awayTeamImg: sample.awayTeamImg,
        playerId: sample.playerId,
        form,
        priced,
        sample,
      });
    }

    rows.sort((a, b) => {
      if (sort === "odds") {
        const ao = a.priced?.odds ?? Number.POSITIVE_INFINITY;
        const bo = b.priced?.odds ?? Number.POSITIVE_INFINITY;
        return ao - bo;
      }
      if (sort === "edge") {
        const ae = a.priced?.edgePct ?? a.priced?.edgeScore ?? Number.NEGATIVE_INFINITY;
        const be = b.priced?.edgePct ?? b.priced?.edgeScore ?? Number.NEGATIVE_INFINITY;
        return be - ae;
      }
      return (b.form.hitPct ?? -1) - (a.form.hitPct ?? -1) || (b.form.avg ?? 0) - (a.form.avg ?? 0);
    });
    return rows;
  }, [
    enabledComps,
    enabledMatches,
    filtersReady,
    hitRateMin,
    market,
    oddsOnly,
    pool,
    slim,
    sort,
    stat,
    threshold,
  ]);

  const pricedVisible = deskRows.filter((row) => row.priced != null);

  function addLeg(prop: PlayerProp) {
    if (!isPriced(prop.odds) || !slip || slip.hasLeg(prop.id)) return;
    const classified = classifySlipMarket(`${prop.selection} ${prop.market}`, {
      marketKey:
        prop.market === "To Be Carded"
          ? "cards"
          : prop.market === "Shots on Target" || prop.market === "Total Shots"
            ? "shots"
            : prop.market === "Fouls Committed" || prop.market === "Fouls Drawn"
              ? "fouls"
              : undefined,
    });
    slip.addLeg({
      id: prop.id,
      marketName: `${prop.player} ${prop.selection}`,
      decimalOdds: prop.odds,
      label: `${prop.player} ${prop.selection}`,
      match: prop.match,
      player: prop.player,
      fixtureId: prop.fixtureId ?? undefined,
      marketKind: classified.marketKind,
      line: classified.line,
    });
  }

  function addAllPriced() {
    for (const row of pricedVisible) {
      if (row.priced) addLeg(row.priced);
    }
  }

  function copyLink() {
    if (typeof window === "undefined") return;
    void navigator.clipboard.writeText(window.location.href);
  }

  function toggleComp(name: string, on: boolean, matches: string[]) {
    const comps = new Set(enabledComps);
    const fixtureSet = new Set(enabledMatches);
    if (on) {
      comps.add(name);
      for (const match of matches) fixtureSet.add(match);
    } else {
      comps.delete(name);
      for (const match of matches) fixtureSet.delete(match);
    }
    setEnabledComps(comps);
    setEnabledMatches(fixtureSet);
    syncUrl({ comps });
  }

  function toggleMatch(comp: string, match: string, on: boolean, allMatches: string[]) {
    const fixtureSet = new Set(enabledMatches);
    if (on) fixtureSet.add(match);
    else fixtureSet.delete(match);
    const comps = new Set(enabledComps);
    const anyOn = allMatches.some((row) => fixtureSet.has(row));
    if (anyOn) comps.add(comp);
    else comps.delete(comp);
    setEnabledMatches(fixtureSet);
    setEnabledComps(comps);
    syncUrl({ comps });
  }

  const emptyDetail = (() => {
    if (source.length === 0) {
      return { title: "No Book Odds", detail: "No stored player props for today's pre-match fixtures", source: "prematch_odds" };
    }
    if (!slim && competitions.every((c) => c.matches.length === 0)) {
      return { title: "No fixtures", detail: "No fixtures stored for today", source: "fixtures" };
    }
    if (!slim && enabledMatches.size === 0) {
      return { title: "No fixtures selected", detail: "Enable a competition or fixture in the sidebar", source: "fixtures" };
    }
    if (oddsOnly) {
      return {
        title: "No priced clears",
        detail: `No Bet365 ${threshold}+ ${statLabel(stat)} props clear the ${hitRateMin}% hit-rate filter`,
        source: "prematch_odds",
      };
    }
    return {
      title: "No matching props",
      detail: `No last-5 form clears ${threshold}+ ${statLabel(stat)} at ${hitRateMin}% hit rate`,
      source: "fixture_player_statistics",
    };
  })();

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-[#eef3f9]">
      <div
        className={`grid min-h-[640px] grid-cols-1 ${
          slim ? "lg:grid-cols-1" : "lg:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <aside className="space-y-4 border-b border-[#e2e8f0] bg-white p-4 lg:border-r lg:border-b-0">
          {!slim ? (
            <div>
              <h3 className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                Best picks today
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bestPicks.length === 0 ? (
                  <p className="text-xs font-semibold text-[#94a3b8]">No priced props stored</p>
                ) : (
                  bestPicks.map((pick) => (
                    <button
                      key={pick.id}
                      type="button"
                      aria-pressed={stat === pick.id}
                      onClick={() => {
                        setStat(pick.id);
                        const nextThr = defaultThresholdForStat(pick.id);
                        setThreshold(nextThr);
                        syncUrl({ stat: pick.id, threshold: nextThr });
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        stat === pick.id
                          ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                          : "border-[#e2e8f0] bg-white text-[#0f172a]"
                      }`}
                    >
                      {pick.label} · {pick.n}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {!slim ? (
            <div>
              <h3 className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                Competitions & fixtures
              </h3>
              <div className="mt-2 space-y-2">
                {competitions.length === 0 ? (
                  <p className="text-xs font-semibold text-[#64748b]">No fixtures stored (fixtures).</p>
                ) : (
                  competitions.map((comp) => {
                    const empty = comp.matches.length === 0;
                    const onCount = comp.matches.filter((m) => enabledMatches.has(m)).length;
                    const open = expandedComps.has(comp.name);
                    return (
                      <div
                        key={comp.name}
                        className={`rounded-xl border border-[#e2e8f0] bg-white px-2.5 py-2 ${
                          empty ? "opacity-60" : ""
                        }`}
                      >
                        <label className="flex items-center gap-2 text-sm font-bold text-[#0f172a]">
                          <input
                            type="checkbox"
                            checked={!empty && enabledComps.has(comp.name)}
                            disabled={empty}
                            onChange={(event) =>
                              toggleComp(comp.name, event.target.checked, comp.matches)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{comp.name}</span>
                          <span className="text-[11px] font-semibold text-[#94a3b8]">
                            {empty ? "0 fixtures" : `Fixtures ${onCount}/${comp.matches.length}`}
                          </span>
                        </label>
                        {empty ? (
                          <p className="mt-1 text-xs font-semibold text-[#64748b]">
                            No fixtures stored for today (fixtures).
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="mt-1 text-[11px] font-bold text-[#2563eb]"
                              onClick={() =>
                                setExpandedComps((current) => {
                                  const next = new Set(current);
                                  if (next.has(comp.name)) next.delete(comp.name);
                                  else next.add(comp.name);
                                  return next;
                                })
                              }
                            >
                              Fixtures
                            </button>
                            {open ? (
                              <div className="mt-2 space-y-1.5 border-t border-dashed border-[#e2e8f0] pt-2">
                                {comp.matches.map((match) => (
                                  <label
                                    key={`${comp.name}:${match}`}
                                    className="flex items-start gap-2 text-xs font-semibold text-[#64748b]"
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={enabledMatches.has(match)}
                                      onChange={(event) =>
                                        toggleMatch(
                                          comp.name,
                                          match,
                                          event.target.checked,
                                          comp.matches,
                                        )
                                      }
                                    />
                                    <span>{match}</span>
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-[#0f172a]">{matchFilter}</p>
          )}

          <div>
            <h3 className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
              Pick a stat
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {DESK_STAT_MARKETS.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={stat === row.id}
                  onClick={() => {
                    setStat(row.id);
                    const nextThr = defaultThresholdForStat(row.id);
                    setThreshold(nextThr);
                    syncUrl({ stat: row.id, threshold: nextThr });
                  }}
                  className={`rounded-xl border px-2 py-2 text-left text-xs font-bold ${
                    stat === row.id
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                      : "border-[#e2e8f0] bg-white text-[#0f172a]"
                  }`}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
              At least · priced lines underlined
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {thresholdOptions.map((line) => {
                const priced = pricedLinesForStat.has(line);
                return (
                  <button
                    key={line}
                    type="button"
                    aria-pressed={threshold === line}
                    onClick={() => {
                      setThreshold(line);
                      syncUrl({ threshold: line });
                    }}
                    className={`rounded-full border px-2.5 py-1.5 text-left text-xs font-bold ${
                      threshold === line
                        ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                        : "border-[#e2e8f0] bg-white text-[#0f172a]"
                    } ${priced ? "shadow-[inset_0_-2px_0_#10b981]" : ""}`}
                  >
                    {line}+
                    <span className="mt-0.5 block text-[10px] font-semibold text-[#94a3b8]">
                      {priced ? "Bet365 priced" : "no book line"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-xs font-semibold text-[#64748b]">
            <span>
              Min hit rate · <span className="font-extrabold text-[#0f172a]">{hitRateMin}%</span>
            </span>
            <input
              type="range"
              min={40}
              max={100}
              step={10}
              value={hitRateMin}
              onChange={(event) => {
                const value = Number(event.target.value);
                setHitRateMin(value);
                syncUrl({ hitrate: value });
              }}
              className="mt-2 w-full accent-[#2563eb]"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-bold text-[#0f172a]">
            <input
              type="checkbox"
              checked={oddsOnly}
              onChange={(event) => {
                setOddsOnly(event.target.checked);
                syncUrl({ oddsonly: event.target.checked });
              }}
            />
            Odds only
          </label>
        </aside>

        <section className="flex min-w-0 flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-[#0f172a]">Results</h2>
            {!slim ? (
              <button
                type="button"
                onClick={copyLink}
                className="text-xs font-bold text-[#2563eb] hover:underline"
              >
                Copy link
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-[#0f172a]">
              {threshold}+ {statLabel(stat)}
            </span>
            <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-[#0f172a]">
              Last 5 games
            </span>
            <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-[#0f172a]">
              {hitRateMin}% Hit Rate
            </span>
            {oddsOnly ? (
              <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-1 text-xs font-bold text-[#0f172a]">
                Odds only
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#64748b]">
            <button
              type="button"
              disabled={pricedVisible.length === 0}
              onClick={addAllPriced}
              className="rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add all to Bet Slip ({pricedVisible.length})
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <span>Sort</span>
              {(
                [
                  ["hit", "Hit rate"],
                  ["edge", "Edge"],
                  ["odds", "Odds"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={sort === id}
                  onClick={() => setSort(id)}
                  className={`rounded-full border px-2 py-1 text-[11px] font-bold ${
                    sort === id
                      ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                      : "border-[#e2e8f0] bg-white text-[#64748b]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] overflow-auto rounded-2xl border border-[#e2e8f0] bg-white">
            {deskRows.length === 0 ? (
              <EmptyReason
                variant="center"
                className="m-4 border-0 bg-transparent"
                title={emptyDetail.title}
                detail={emptyDetail.detail}
                source={emptyDetail.source}
              />
            ) : (
              <table className="w-full min-w-[740px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Player
                    </th>
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Hit Rate
                    </th>
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Total
                    </th>
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Avg
                    </th>
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Form
                    </th>
                    <th className="sticky top-0 z-[1] bg-[#f8fafc] px-3 py-2.5 text-right text-[10px] font-extrabold tracking-wide text-[#94a3b8] uppercase">
                      Odds
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deskRows.map((row) => {
                    const open = openKey === row.key;
                    const priced = row.priced;
                    const added = priced ? (slip?.hasLeg(priced.id) ?? false) : false;
                    return (
                      <DeskTableRow
                        key={row.key}
                        row={row}
                        open={open}
                        added={added}
                        threshold={threshold}
                        onToggle={() => setOpenKey(open ? null : row.key)}
                        onAdd={() => {
                          if (priced) addLeg(priced);
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DeskTableRow({
  row,
  open,
  added,
  threshold,
  onToggle,
  onAdd,
}: {
  row: DeskRow;
  open: boolean;
  added: boolean;
  threshold: number;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const priced = row.priced;
  const edge = priced?.edgePct ?? priced?.edgeScore ?? null;

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-[#f1f5f9] hover:bg-[#f8fafc] ${
          open ? "bg-[#eff6ff]" : added ? "bg-blue-50/40" : "bg-white"
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <PlayerHeadshot src={row.playerImg} playerName={row.player} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[#0f172a]">
                {row.player}
                {row.position ? (
                  <span className="ml-1.5 rounded bg-[#f1f5f9] px-1 py-0.5 text-[10px] font-extrabold text-[#64748b]">
                    {row.position}
                  </span>
                ) : null}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <MatchupBadges
                  match={row.match}
                  homeTeamImg={row.homeTeamImg}
                  awayTeamImg={row.awayTeamImg}
                  size="sm"
                />
                <p className="truncate text-[11px] font-semibold text-[#64748b]">{row.match}</p>
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          {row.form.hitPct == null ? (
            <EmptyReason
              detail="No match logs stored"
              source="fixture_player_statistics"
              className="text-[11px]"
            />
          ) : (
            <HitRateBar hitPct={row.form.hitPct} />
          )}
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-extrabold tabular-nums text-[#0f172a]">
          {row.form.total ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-extrabold tabular-nums text-[#0f172a]">
          {row.form.avg == null ? "—" : row.form.avg.toFixed(1)}
        </td>
        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
          <FormDots counts={row.form.counts} threshold={threshold} />
        </td>
        <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold text-[#94a3b8]">Bet365</span>
            <AddToSlipButton
              selectionId={priced?.id ?? `unpriced-${row.key}`}
              marketName={priced ? `${priced.player} ${priced.selection}` : row.player}
              decimalOdds={priced?.odds ?? null}
              match={row.match}
              player={row.player}
              added={added}
              onAdd={onAdd}
              size="sm"
            />
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
          <td colSpan={6} className="px-3 pb-3 pl-14 pt-0">
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs font-bold text-[#64748b]">
              <PoissonVsBook
                modelProb={priced?.modelProb}
                decimalOdds={priced?.odds}
                edgePct={edge}
              />
              {edge != null && edge > 0 ? (
                <span className="rounded-full bg-[#2563eb] px-2.5 py-1 text-white">
                  +{edge.toFixed(1)}% edge
                </span>
              ) : null}
              <SeasonProofBadges
                market={
                  row.sample.market === "To Be Carded"
                    ? "cards"
                    : row.sample.market === "Fouls Committed" || row.sample.market === "Fouls Drawn"
                      ? "fouls"
                      : row.sample.market === "Shots on Target" || row.sample.market === "Total Shots"
                        ? "sot"
                        : "other"
                }
                proof={{
                  appearances: row.sample.appearances,
                  yellows: row.sample.yellows,
                  goals: row.sample.goals,
                  foulsPer90: row.sample.foulsPer90 ?? row.sample.foulsPerGame ?? null,
                  foulsDrawnPer90: row.sample.foulsDrawnPerGame ?? null,
                  tacklesPer90: row.sample.tacklesPer90,
                  sotPer90: row.sample.seasonSotPer90,
                }}
              />
              <StrictRefBadgeFromProfile ref={row.sample.strictRef} />
              <MatchupClashBadgeFromClash clash={row.sample.clash} />
              {row.form.counts.length === 0 ? (
                <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-1">
                  Form empty (fixture_player_statistics)
                </span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function buildCompetitions(props: PlayerProp[]): CompNode[] {
  const map = new Map<string, Set<string>>();
  for (const prop of props) {
    const set = map.get(prop.competition) ?? new Set<string>();
    set.add(prop.match);
    map.set(prop.competition, set);
  }
  return [...map.entries()]
    .map(([name, matches]) => ({
      name,
      matches: [...matches].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
