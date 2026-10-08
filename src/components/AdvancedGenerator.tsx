"use client";

import { useEffect, useMemo, useState } from "react";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { GeneratorSlip, slipCombinedOdds } from "@/components/generator/GeneratorSlip";
import { AngleFilters, angleAvailability, matchesAngle, type AngleFilter } from "@/components/stats/AngleFilters";
import { EmptyReason } from "@/components/stats/EmptyReason";
import {
  buildValidatedSlipFromRanked,
  compareByEdgeThenHit,
  validateSlipCandidate,
} from "@/utils/betslip/slipValidator";
import { effectiveLegOdds, modelOddsFromHitRate } from "@/lib/odds/matcher";

/** Explicit inclusion list, or `"all"` for every available item (default). */
type CheckSelection = string[] | "all";

type Competition = string;

type MarketType =
  | "Match Winner"
  | "Double Chance"
  | "Draw No Bet"
  | "BTTS"
  | "Over 2.5"
  | "Under 2.5"
  | "1st Half Goals"
  | "Match Corners"
  | "Match Cards"
  | "Shots on Target"
  | "Total Shots"
  | "To Be Carded"
  | "Fouls Committed"
  | "Fouls Drawn"
  | "Tackles"
  | "GK Saves";

export type GeneratorProp = {
  id: number;
  competition: Competition;
  match: string;
  selection: string;
  marketType: MarketType;
  /** Bet365 / bookmaker decimal odds when stored. */
  odds: number | null;
  /**
   * Fair / implied odds from hit rate when book odds are missing:
   * `1 / (hitRate / 100)`. Used for slip math + Fair Price badge.
   */
  modelOdds?: number | null;
  hitRate: number;
  foulsPerGame?: number;
  position?: string | null;
  form?: Array<boolean | null>;
  formCounts?: number[];
  sotForm?: Array<boolean | null>;
  seasonSotPer90?: number | null;
  modelProb?: number | null;
  edgePct?: number | null;
  clash?: { playerRate: number; opponentRate: number; label: string } | null;
  strictRef?: { name: string; avg: number; vsLeaguePct: number | null } | null;
  highFoulSide?: boolean;
  /** Sportsbook half-line (0.5 / 1.5 / …) when this is a player prop. */
  lineHalf?: number | null;
  playerId?: number | null;
  playerName?: string | null;
};

type Prop = GeneratorProp;

type Mode = "high-probability" | "value-edge";

/** Sentinel: Any threshold — do not filter player prop lines. */
const THRESHOLD_ANY = -1;
const THRESHOLD_OPTIONS = [0.5, 1.5, 2.5, 3.5, 4.5] as const;
const THRESHOLD_DEFAULT: number[] = [0.5, 1.5, 2.5];

const MODE_COPY: Record<Mode, { label: string; note: string }> = {
  "high-probability": {
    label: "High Probability",
    note: "Consistent strike rates",
  },
  "value-edge": { label: "Value Edge", note: "Prioritizes +EV odds" },
};

const PARAM_DEFAULTS = { legCount: 4, minOdds: 1.35, minHitRate: 50 };
const PARAM_LIMITS = {
  legs: { min: 1, max: 8 },
  odds: { min: 1.01 },
  hitRate: { min: 1, max: 99 },
};

type MarketPill = { label: string; markets: MarketType[] };

const MATCH_MARKET_PILLS: MarketPill[] = [
  { label: "Result (1X2)", markets: ["Match Winner"] },
  { label: "Double Chance", markets: ["Double Chance"] },
  { label: "Draw No Bet", markets: ["Draw No Bet"] },
  { label: "BTTS", markets: ["BTTS"] },
  { label: "Over/Under Goals", markets: ["Over 2.5", "Under 2.5"] },
  { label: "1st Half Goals", markets: ["1st Half Goals"] },
  { label: "Corners", markets: ["Match Corners"] },
  { label: "Cards", markets: ["Match Cards"] },
];

const PLAYER_PROP_PILLS: MarketPill[] = [
  { label: "Shots on Target", markets: ["Shots on Target"] },
  { label: "Total Shots", markets: ["Total Shots"] },
  { label: "To Be Carded", markets: ["To Be Carded"] },
  { label: "Fouls Committed", markets: ["Fouls Committed"] },
  { label: "Fouls Drawn", markets: ["Fouls Drawn"] },
  { label: "Tackles", markets: ["Tackles"] },
  { label: "GK Saves", markets: ["GK Saves"] },
];

const ALL_MARKET_PILLS = [...MATCH_MARKET_PILLS, ...PLAYER_PROP_PILLS];
const MATCH_MARKET_TYPES = new Set<MarketType>(
  MATCH_MARKET_PILLS.flatMap((pill) => pill.markets),
);
const PLAYER_MARKET_TYPES = new Set<MarketType>(
  PLAYER_PROP_PILLS.flatMap((pill) => pill.markets),
);

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function pricedOdds(odds: number | null | undefined): odds is number {
  return odds != null && Number.isFinite(odds) && odds > 1;
}

/** Ensure every prop carries modelOdds when book odds are missing. */
function withModelOdds(prop: Prop): Prop {
  if (pricedOdds(prop.odds)) return { ...prop, modelOdds: prop.modelOdds ?? null };
  return {
    ...prop,
    modelOdds: prop.modelOdds ?? modelOddsFromHitRate(prop.hitRate),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function rankProps(props: Prop[], mode: Mode): Prop[] {
  return [...props].sort((left, right) => {
    if (mode === "value-edge") {
      // Highest edge first so player subsumption keeps the best EV leg.
      const byEdge = compareByEdgeThenHit(left, right);
      if (byEdge !== 0) return byEdge;
      const leftOdds = effectiveLegOdds(left.odds, left.modelOdds) ?? Number.NEGATIVE_INFINITY;
      const rightOdds = effectiveLegOdds(right.odds, right.modelOdds) ?? Number.NEGATIVE_INFINITY;
      return rightOdds - leftOdds || right.hitRate - left.hitRate;
    }
    if (left.marketType === "To Be Carded" && right.marketType === "To Be Carded") {
      return (
        right.hitRate - left.hitRate ||
        (right.foulsPerGame ?? 0) - (left.foulsPerGame ?? 0) ||
        compareByEdgeThenHit(left, right)
      );
    }
    const leftOdds = effectiveLegOdds(left.odds, left.modelOdds) ?? Number.POSITIVE_INFINITY;
    const rightOdds = effectiveLegOdds(right.odds, right.modelOdds) ?? Number.POSITIVE_INFINITY;
    return (
      right.hitRate - left.hitRate ||
      leftOdds - rightOdds ||
      compareByEdgeThenHit(left, right)
    );
  });
}

function canAdd(slip: Prop[], prop: Prop) {
  return validateSlipCandidate(slip, prop).ok;
}

/** Resolve sportsbook half-line from selection text / market. */
function propHalfLine(prop: Prop): number | null {
  if (prop.lineHalf != null && Number.isFinite(prop.lineHalf)) return prop.lineHalf;
  if (!PLAYER_MARKET_TYPES.has(prop.marketType)) return null;
  if (prop.marketType === "To Be Carded") return 0.5;
  const match = prop.selection.match(/(\d+)\+/);
  if (!match) return null;
  const clear = Number(match[1]);
  if (!Number.isFinite(clear) || clear <= 0) return null;
  return clear - 0.5;
}

function matchesSelectedThresholds(prop: Prop, selectedThresholds: number[]) {
  if (selectedThresholds.includes(THRESHOLD_ANY)) return true;
  if (!PLAYER_MARKET_TYPES.has(prop.marketType)) return true;
  const half = propHalfLine(prop);
  // Non-half markets stay eligible when player props are on.
  if (half == null) return true;
  return selectedThresholds.some((value) => Math.abs(value - half) < 1e-9);
}

/**
 * Build a conflict-free slip by scanning the ranked EV list through SlipValidator.
 * When mixMatchAndPlayer is on, alternate match-market / player-prop preference
 * while still enforcing player subsumption + the conflict matrix.
 */
function buildSlip(pool: Prop[], legs: number, mixMatchAndPlayer: boolean, mode: Mode) {
  const ranked = rankProps(pool, mode);

  if (!mixMatchAndPlayer || legs < 2) {
    return buildValidatedSlipFromRanked(ranked, legs);
  }

  const matchPool = rankProps(
    pool.filter((prop) => MATCH_MARKET_TYPES.has(prop.marketType)),
    mode,
  );
  const playerPool = rankProps(
    pool.filter((prop) => PLAYER_MARKET_TYPES.has(prop.marketType)),
    mode,
  );

  if (matchPool.length === 0) return buildValidatedSlipFromRanked(playerPool, legs);
  if (playerPool.length === 0) return buildValidatedSlipFromRanked(matchPool, legs);

  const slip: Prop[] = [];
  let matchIdx = 0;
  let playerIdx = 0;
  let preferPlayer = false;

  while (slip.length < legs && (matchIdx < matchPool.length || playerIdx < playerPool.length)) {
    const tryPlayerFirst = preferPlayer;
    const queues: Array<{ list: Prop[]; index: number; kind: "match" | "player" }> = tryPlayerFirst
      ? [
          { list: playerPool, index: playerIdx, kind: "player" },
          { list: matchPool, index: matchIdx, kind: "match" },
        ]
      : [
          { list: matchPool, index: matchIdx, kind: "match" },
          { list: playerPool, index: playerIdx, kind: "player" },
        ];

    let added = false;
    for (const queue of queues) {
      while (queue.index < queue.list.length) {
        const candidate = queue.list[queue.index]!;
        queue.index += 1;
        if (!canAdd(slip, candidate)) continue;
        slip.push(candidate);
        added = true;
        if (queue.kind === "match") matchIdx = queue.index;
        else playerIdx = queue.index;
        break;
      }
      if (added) break;
      if (queue.kind === "match") matchIdx = queue.index;
      else playerIdx = queue.index;
    }

    if (!added) break;
    preferPlayer = !preferPlayer;
  }

  if (slip.length < legs) {
    for (const candidate of ranked) {
      if (slip.length >= legs) break;
      if (!canAdd(slip, candidate)) continue;
      slip.push(candidate);
    }
  }

  return slip.slice(0, legs);
}

export default function AdvancedGenerator({
  props = [],
  oddsPayload: _oddsPayload,
}: {
  props?: GeneratorProp[];
  oddsPayload?: unknown;
}) {
  // Inputs hold the raw number (NaN while the field is cleared); resolved values are clamped below.
  const [legCount, setLegCount] = useState<number>(PARAM_DEFAULTS.legCount);
  const [minOdds, setMinOdds] = useState<number>(PARAM_DEFAULTS.minOdds);
  const [minHitRate, setMinHitRate] = useState<number>(
    PARAM_DEFAULTS.minHitRate,
  );
  const [selectedThresholds, setSelectedThresholds] =
    useState<number[]>(THRESHOLD_DEFAULT);
  const [checkedLeagues, setCheckedLeagues] = useState<CheckSelection>("all");
  const [checkedMatches, setCheckedMatches] = useState<CheckSelection>("all");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([
    "Result (1X2)",
  ]);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [mode, setMode] = useState<Mode>("high-probability");
  const [generatedSlip, setGeneratedSlip] = useState<Prop[]>([]);
  const [generated, setGenerated] = useState(false);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [angleFilter, setAngleFilter] = useState<AngleFilter>("all");
  const { formatOdds, formatOddsLabel } = useDisplayPrefs();

  const source = useMemo(() => props.map(withModelOdds), [props]);
  const availableLeagues = useMemo(
    () => [...new Set(source.map((prop) => prop.competition))].sort((a, b) => a.localeCompare(b)),
    [source],
  );
  const allFixtures = useMemo(() => {
    const byMatch = new Map<string, { match: string; competition: string }>();
    for (const prop of source) {
      if (!byMatch.has(prop.match)) {
        byMatch.set(prop.match, { match: prop.match, competition: prop.competition });
      }
    }
    return [...byMatch.values()].sort(
      (left, right) =>
        left.competition.localeCompare(right.competition) || left.match.localeCompare(right.match),
    );
  }, [source]);

  const effectiveLeagues = useMemo(() => {
    if (checkedLeagues === "all") return availableLeagues;
    return availableLeagues.filter((league) => checkedLeagues.includes(league));
  }, [availableLeagues, checkedLeagues]);

  const visibleFixtures = useMemo(
    () => allFixtures.filter((fixture) => effectiveLeagues.includes(fixture.competition)),
    [allFixtures, effectiveLeagues],
  );

  const effectiveMatches = useMemo(() => {
    const visible = visibleFixtures.map((fixture) => fixture.match);
    if (checkedMatches === "all") return visible;
    return visible.filter((match) => checkedMatches.includes(match));
  }, [visibleFixtures, checkedMatches]);

  const allLeaguesChecked =
    availableLeagues.length > 0 &&
    (checkedLeagues === "all" || availableLeagues.every((league) => checkedLeagues.includes(league)));
  const allFixturesChecked =
    visibleFixtures.length > 0 &&
    (checkedMatches === "all" ||
      visibleFixtures.every((fixture) => checkedMatches.includes(fixture.match)));

  const cardMarketSelected = selectedMarkets.includes("To Be Carded");
  const mixMarketsSelected =
    MATCH_MARKET_PILLS.some((pill) => selectedMarkets.includes(pill.label)) &&
    PLAYER_PROP_PILLS.some((pill) => selectedMarkets.includes(pill.label));

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const hasFixtureSelection = effectiveMatches.length > 0;
  const canGenerate = hasFixtureSelection && (isRandomMode || selectedMarkets.length > 0);

  const legs = Math.round(
    clamp(
      legCount,
      PARAM_LIMITS.legs.min,
      PARAM_LIMITS.legs.max,
      PARAM_DEFAULTS.legCount,
    ),
  );
  const oddsFloor = clamp(
    minOdds,
    PARAM_LIMITS.odds.min,
    Number.POSITIVE_INFINITY,
    PARAM_DEFAULTS.minOdds,
  );
  const hitFloor = clamp(
    minHitRate,
    PARAM_LIMITS.hitRate.min,
    PARAM_LIMITS.hitRate.max,
    PARAM_DEFAULTS.minHitRate,
  );

  function toggleThreshold(value: number | typeof THRESHOLD_ANY) {
    if (value === THRESHOLD_ANY) {
      setSelectedThresholds([THRESHOLD_ANY]);
      return;
    }
    setSelectedThresholds((current) => {
      const withoutAny = current.filter((item) => item !== THRESHOLD_ANY);
      if (withoutAny.some((item) => Math.abs(item - value) < 1e-9)) {
        const next = withoutAny.filter((item) => Math.abs(item - value) >= 1e-9);
        return next.length === 0 ? [THRESHOLD_ANY] : next;
      }
      return [...withoutAny, value].sort((a, b) => a - b);
    });
  }

  function toggleMarket(label: string) {
    setSelectedMarkets((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  }

  function setAllLeagues(on: boolean) {
    setCheckedLeagues(on ? "all" : []);
    if (on) {
      setCheckedMatches("all");
    } else {
      setCheckedMatches([]);
    }
  }

  function toggleLeague(league: string) {
    const currentlyOn = effectiveLeagues.includes(league);
    const leagueMatches = allFixtures
      .filter((fixture) => fixture.competition === league)
      .map((fixture) => fixture.match);

    if (currentlyOn) {
      const nextLeagues = effectiveLeagues.filter((item) => item !== league);
      setCheckedLeagues(
        nextLeagues.length === availableLeagues.length ? "all" : nextLeagues,
      );
      setCheckedMatches((previous) => {
        const base =
          previous === "all"
            ? visibleFixtures.map((fixture) => fixture.match)
            : previous;
        const next = base.filter((match) => !leagueMatches.includes(match));
        const remainingVisible = allFixtures
          .filter((fixture) => nextLeagues.includes(fixture.competition))
          .map((fixture) => fixture.match);
        if (next.length === remainingVisible.length && remainingVisible.every((match) => next.includes(match))) {
          return "all";
        }
        return next;
      });
      return;
    }

    const nextLeagues = [...effectiveLeagues, league];
    setCheckedLeagues(
      nextLeagues.length === availableLeagues.length ? "all" : nextLeagues,
    );
    // Reticking a competition brings its fixtures back checked.
    setCheckedMatches((previous) => {
      if (previous === "all") return "all";
      const next = [...new Set([...previous, ...leagueMatches])];
      const remainingVisible = allFixtures
        .filter((fixture) => nextLeagues.includes(fixture.competition))
        .map((fixture) => fixture.match);
      if (remainingVisible.every((match) => next.includes(match))) return "all";
      return next;
    });
  }

  function setAllFixtures(on: boolean) {
    setCheckedMatches(on ? "all" : []);
  }

  function toggleFixture(match: string) {
    const visible = visibleFixtures.map((fixture) => fixture.match);
    const currentlyOn = effectiveMatches.includes(match);
    const base = checkedMatches === "all" ? visible : checkedMatches.filter((item) => visible.includes(item));
    const next = currentlyOn ? base.filter((item) => item !== match) : [...base, match];
    setCheckedMatches(next.length === visible.length && visible.every((item) => next.includes(item)) ? "all" : next);
  }

  function generate() {
    if (!hasFixtureSelection) return;
    const selectedPills = ALL_MARKET_PILLS.filter((pill) =>
      selectedMarkets.includes(pill.label),
    );
    const marketTypes = new Set(selectedPills.flatMap((pill) => pill.markets));
    const mixMatchAndPlayer = isRandomMode || mixMarketsSelected;
    const matchSet = new Set(effectiveMatches);
    const leagueSet = new Set(effectiveLeagues);

    let pool = source.filter(
      (prop) => leagueSet.has(prop.competition) && matchSet.has(prop.match),
    );
    if (!isRandomMode)
      pool = pool.filter((prop) => marketTypes.has(prop.marketType));
    pool = pool.filter((prop) => {
      // Floor applies to book prices; Fair Price (modelOdds) stays eligible so
      // unpriced niche markets can still fill the slip.
      if (pricedOdds(prop.odds) && prop.odds < oddsFloor) return false;
      if (!matchesAngle(prop, angleFilter)) return false;
      if (!matchesSelectedThresholds(prop, selectedThresholds)) return false;
      return prop.hitRate >= hitFloor;
    });

    // Scan ranked EV list through SlipValidator until we fill `legs` (or exhaust pool).
    const ranked = rankProps(pool, mode);
    const slip = isRandomMode
      ? buildValidatedSlipFromRanked(shuffle(ranked), legs)
      : buildSlip(pool, legs, mixMatchAndPlayer, mode);

    setGeneratedSlip(slip.map(withModelOdds));
    setShortfall(slip.length < legs ? slip.length : null);
    setGenerated(true);
    setCopied(false);
  }

  const combined = slipCombinedOdds(generatedSlip);
  const totalOddsLabel =
    combined == null ? "—" : formatOdds(combined) ?? combined.toFixed(2);

  async function copySlip() {
    const lines = generatedSlip.map((prop) => {
      const book = pricedOdds(prop.odds) ? formatOddsLabel(prop.odds) : null;
      const fair =
        !book && pricedOdds(prop.modelOdds)
          ? `Fair Price @ ${formatOdds(prop.modelOdds) ?? prop.modelOdds.toFixed(2)}`
          : null;
      return `${prop.selection} — ${prop.match} ${book ?? fair ?? "Unpriced"}`;
    });
    lines.push(`Total odds ${totalOddsLabel}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <aside className="flex flex-col rounded-xl border border-gray-200 bg-white px-5 pb-5 shadow-sm lg:col-span-5">
        <Group label="Competitions today">
          {availableLeagues.length === 0 ? (
            <EmptyReason
              detail="No competitions with pre-match fixtures stored for today"
              source="fixtures"
            />
          ) : (
            <CheckboxList>
              <CheckboxRow
                id="select-all-competitions"
                label="Select all competitions"
                checked={allLeaguesChecked}
                onChange={setAllLeagues}
                strong
              />
              {availableLeagues.map((league) => (
                <CheckboxRow
                  key={league}
                  id={`competition-${league}`}
                  label={league}
                  checked={effectiveLeagues.includes(league)}
                  onChange={() => toggleLeague(league)}
                />
              ))}
            </CheckboxList>
          )}
        </Group>

        <Group label="Fixtures">
          {visibleFixtures.length === 0 ? (
            <EmptyReason
              detail={
                effectiveLeagues.length === 0
                  ? "Tick at least one competition to list fixtures"
                  : "No pre-match fixtures stored for the selected competitions"
              }
              source={effectiveLeagues.length === 0 ? undefined : "fixtures"}
            />
          ) : (
            <CheckboxList scroll>
              <CheckboxRow
                id="select-all-fixtures"
                label="Select all fixtures"
                checked={allFixturesChecked}
                onChange={setAllFixtures}
                strong
              />
              {visibleFixtures.map((fixture) => (
                <CheckboxRow
                  key={fixture.match}
                  id={`fixture-${fixture.match}`}
                  label={fixture.match}
                  hint={fixture.competition}
                  checked={effectiveMatches.includes(fixture.match)}
                  onChange={() => toggleFixture(fixture.match)}
                />
              ))}
            </CheckboxList>
          )}
          {!hasFixtureSelection ? (
            <p className="mt-2 text-xs text-muted">
              No fixtures selected — tick at least one fixture to generate.
            </p>
          ) : null}
        </Group>

        <Group label="Model parameters">
          <div className="grid grid-cols-3 gap-4">
            <ParamInput
              id="legs"
              label="Legs (1-8)"
              value={legCount}
              onChange={setLegCount}
              min={PARAM_LIMITS.legs.min}
              max={PARAM_LIMITS.legs.max}
              step={1}
            />
            <ParamInput
              id="min-odds"
              label="Min odds"
              value={minOdds}
              onChange={setMinOdds}
              min={PARAM_LIMITS.odds.min}
              step={0.01}
              prefix="@"
            />
            <ParamInput
              id="min-hit-rate"
              label="Min hit rate"
              value={minHitRate}
              onChange={setMinHitRate}
              min={PARAM_LIMITS.hitRate.min}
              max={PARAM_LIMITS.hitRate.max}
              step={1}
              suffix="%"
            />
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              Line thresholds
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Line thresholds"
            >
              {THRESHOLD_OPTIONS.map((half) => {
                const on =
                  !selectedThresholds.includes(THRESHOLD_ANY) &&
                  selectedThresholds.some((item) => Math.abs(item - half) < 1e-9);
                return (
                  <button
                    key={half}
                    type="button"
                    onClick={() => toggleThreshold(half)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums ${
                      on
                        ? "bg-cobalt text-white"
                        : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {half}+
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => toggleThreshold(THRESHOLD_ANY)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  selectedThresholds.includes(THRESHOLD_ANY)
                    ? "bg-cobalt text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Any
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Player props only use the selected half-lines (e.g. 0.5+ → 1+, 1.5+ → 2+).
            </p>
          </div>
          {cardMarketSelected ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Card hit rates are Poisson P(≥1 yellow) from cards, fouls and position. Slip prices are live Bet365 / Paddy Power from Odds-API.io; Fair Price only appears if the book has no quote.
            </p>
          ) : null}
        </Group>

        <Group label="Model optimization">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {MODE_COPY[mode].label}
              </p>
              <p className="text-xs text-gray-500">{MODE_COPY[mode].note}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span
                className={
                  mode === "high-probability"
                    ? "text-slate-900"
                    : "text-gray-400"
                }
              >
                High Probability
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={mode === "value-edge"}
                aria-label="Model optimization"
                onClick={() =>
                  setMode((current) =>
                    current === "high-probability"
                      ? "value-edge"
                      : "high-probability",
                  )
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${mode === "value-edge" ? "bg-blue-600" : "bg-gray-200"}`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${mode === "value-edge" ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
              <span
                className={
                  mode === "value-edge" ? "text-slate-900" : "text-gray-400"
                }
              >
                Value Edge
              </span>
            </div>
          </div>
        </Group>

        <Group
          label="Match markets"
          action={
            <button
              type="button"
              aria-pressed={isRandomMode}
              onClick={() => setIsRandomMode((value) => !value)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                isRandomMode
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              Auto-Find Edges
            </button>
          }
        >
          <p className="mb-2 text-[11px] italic text-gray-400">
            Algorithm dynamically selects the highest mathematical edges.
          </p>
          <PillRow faded={isRandomMode}>
            {MATCH_MARKET_PILLS.map((pill) => (
              <Pill
                key={pill.label}
                active={selectedMarkets.includes(pill.label)}
                onClick={() => toggleMarket(pill.label)}
                disabled={isRandomMode}
              >
                {pill.label}
              </Pill>
            ))}
          </PillRow>
        </Group>

        <Group label="Player props" last>
          <PillRow faded={isRandomMode}>
            {PLAYER_PROP_PILLS.map((pill) => (
              <Pill
                key={pill.label}
                active={selectedMarkets.includes(pill.label)}
                onClick={() => toggleMarket(pill.label)}
                disabled={isRandomMode}
              >
                {pill.label}
              </Pill>
            ))}
          </PillRow>
          {isRandomMode ? (
            <p className="mt-2 text-xs text-gray-500">
              Auto-Find is on: match markets and player props are mixed on the slip.
            </p>
          ) : selectedMarkets.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              Toggle at least one market, or switch on Auto-Find Edges.
            </p>
          ) : mixMarketsSelected ? (
            <p className="mt-2 text-xs text-gray-500">
              Match markets and player props are both on — the slip takes legs from each, paired on the same match when it can.
            </p>
          ) : null}
        </Group>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Angle finder</p>
          <AngleFilters current={angleFilter} onChange={setAngleFilter} available={angleAvailability(source)} />
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className="mt-auto w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Generate {legs}-Leg Edge Slip
        </button>
      </aside>

      <section className="self-start lg:sticky lg:top-6 lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <h2 className="text-sm font-semibold tracking-tight">
              Data-Backed Algorithmic Slip
            </h2>
            <span className="text-xs text-slate-300">
              {generatedSlip.length > 0
                ? `${generatedSlip.length} ${generatedSlip.length === 1 ? "leg" : "legs"} · ${MODE_COPY[mode].label}`
                : "Empty"}
            </span>
          </div>

          {!generated ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No slip yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Set your filters on the left and generate an Edge Slip.
              </p>
            </div>
          ) : generatedSlip.length === 0 ? (
            <EmptyReason
              className="m-4 bg-white"
              variant="center"
              title="Nothing clears those filters"
              detail={
                source.length === 0
                  ? "No markets with hit rates for the selected fixtures — cannot build a slip"
                  : "Markets exist, but none clear the odds floor, confidence, markets, or angle"
              }
              source={source.length === 0 ? "prematch_odds" : undefined}
            />
          ) : (
            <GeneratorSlip
              slip={generatedSlip}
              shortfall={shortfall}
              legs={legs}
              copied={copied}
              onCopy={copySlip}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function Group({
  label,
  children,
  action,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`py-4 ${last ? "" : "border-b border-gray-100"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {label}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function CheckboxList({
  children,
  scroll = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      className={`space-y-1 rounded-lg border border-gray-100 bg-slate-50/60 px-2 py-1.5 ${
        scroll ? "max-h-56 overflow-y-auto" : ""
      }`}
    >
      {children}
    </div>
  );
}

function CheckboxRow({
  id,
  label,
  hint,
  checked,
  onChange,
  strong = false,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  strong?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-white"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
      />
      <span className="min-w-0">
        <span
          className={`block text-sm ${
            strong ? "font-semibold text-slate-900" : "font-medium text-slate-800"
          }`}
        >
          {label}
        </span>
        {hint ? <span className="block text-[11px] text-gray-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function ParamInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  disabled = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <label
        htmlFor={id}
        className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500"
      >
        {label}
      </label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Number.isNaN(value) ? "" : value}
          onChange={(event) => onChange(event.target.valueAsNumber)}
          className={`w-full rounded-md border border-gray-200 bg-white py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:cursor-not-allowed ${
            prefix ? "pl-7" : "pl-3"
          } ${suffix ? "pr-7" : "pr-3"}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PillRow({
  children,
  faded = false,
}: {
  children: React.ReactNode;
  faded?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 transition-opacity ${faded ? "pointer-events-none opacity-40" : ""}`}
      aria-disabled={faded}
    >
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  disabled = false,
  tone = "solid",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "solid" | "soft";
}) {
  const activeClass =
    tone === "solid"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? activeClass
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
