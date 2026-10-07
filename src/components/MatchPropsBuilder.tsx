"use client";

import { useState } from "react";

import LeagueFilter from "@/components/LeagueFilter";
import { MatchupBadges } from "@/components/Media";
import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { AddToSlipButton } from "@/components/stats/AddToSlipButton";
import { useBetSlip } from "@/components/stats/BetSlipContext";
import { classifySlipMarket } from "@/utils/betslip/checkCorrelation";
import { EmptyReason } from "@/components/stats/EmptyReason";

type Market =
  | "Match Winner (1X2)"
  | "Both Teams to Score (BTTS)"
  | "Over/Under Goals"
  | "Match Corners"
  | "Team Corners"
  | "Match Cards"
  | "Double Chance";

export type MatchProp = {
  id: number;
  competition: string;
  match: string;
  homeTeamImg: string; // "" => fallback 3-letter code
  awayTeamImg: string;
  selection: string; // curated line, e.g. "Over 2.5 Goals"
  market: Market;
  odds: number;
  hitRate: number;
  edgeScore: number; // bookmaker value, percentage points (e.g. 12.4 => +12.4%)
};

type MarketFilter = "All" | Market;
type SortMode = "hit-rate" | "edge";

const MARKET_FILTERS: MarketFilter[] = [
  "All",
  "Match Winner (1X2)",
  "Both Teams to Score (BTTS)",
  "Over/Under Goals",
  "Match Corners",
  "Team Corners",
  "Match Cards",
  "Double Chance",
];

function signed(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

export default function MatchPropsBuilder({
  matchFilter,
  props,
}: {
  matchFilter?: string;
  props?: MatchProp[];
}) {
  const slip = useBetSlip();
  const { formatOdds, formatOddsLabel } = useDisplayPrefs();
  const [activeSlip, setActiveSlip] = useState<MatchProp[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]); // [] means all leagues
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("All");
  const [minOdds, setMinOdds] = useState<number>(NaN); // NaN = no floor (input cleared)
  const [sortMode, setSortMode] = useState<SortMode>("hit-rate");
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null); // set on click only, keeps SSR deterministic

  const source = props ?? [];
  const availableLeagues: string[] = [...new Set(source.map((prop) => prop.competition))];
  const pool = matchFilter
    ? source.filter((prop) => prop.match === matchFilter)
    : source;

  const rows = pool
    .filter(
      (prop) =>
        Boolean(matchFilter) ||
        selectedLeagues.length === 0 ||
        selectedLeagues.includes(prop.competition),
    )
    .filter((prop) => marketFilter === "All" || prop.market === marketFilter)
    .filter((prop) => Number.isNaN(minOdds) || prop.odds >= minOdds)
    .sort((a, b) =>
      sortMode === "hit-rate"
        ? b.hitRate - a.hitRate || b.edgeScore - a.edgeScore
        : b.edgeScore - a.edgeScore || b.hitRate - a.hitRate,
    );

  const slipIds = new Set(activeSlip.map((prop) => prop.id));
  const totalOdds = activeSlip.reduce(
    (product, prop) => product * prop.odds,
    1,
  );

  function addLeg(prop: MatchProp) {
    if (slipIds.has(prop.id) || !(prop.odds > 1)) return;
    setActiveSlip((current) => [...current, prop]);
    const classified = classifySlipMarket(`${prop.selection} ${prop.market}`);
    slip?.addLeg({
      id: prop.id,
      marketName: prop.selection,
      decimalOdds: prop.odds,
      label: prop.selection,
      match: prop.match,
      marketKind: classified.marketKind,
      line: classified.line,
    });
    setCopied(false);
  }

  function removeLeg(id: number) {
    setActiveSlip((current) => {
      const next = current.filter((prop) => prop.id !== id);
      if (next.length === 0) setDrawerOpen(false);
      return next;
    });
    slip?.removeLeg(id);
    setCopied(false);
  }

  function refreshOdds() {
    setRefreshedAt(new Date());
  }

  async function copySlip() {
    const lines = activeSlip.map(
      (prop) => `${prop.selection} (${prop.match}) ${formatOddsLabel(prop.odds)}`,
    );
    lines.push(`Total odds ${formatOdds(totalOdds) ?? "—"}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-6 pb-24 lg:pb-0">
      <section className="col-span-12 min-w-0 lg:col-span-8">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {matchFilter ? "This fixture" : "Competitions today"}
            </h2>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full bg-green-500 animate-pulse"
                aria-hidden="true"
              />
              <span className="text-[10px] font-medium text-gray-400">
                LIVE ODDS
              </span>
              <button
                type="button"
                onClick={refreshOdds}
                aria-label="Refresh odds"
                title={
                  refreshedAt
                    ? `Last refreshed ${refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Refresh odds"
                }
                className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
              >
                <span aria-hidden="true" className="text-xs leading-none">
                  ↻
                </span>
              </button>
            </span>
          </div>
          {matchFilter ? (
            <p className="text-sm font-medium text-slate-900">{matchFilter}</p>
          ) : (
            <LeagueFilter
              availableLeagues={availableLeagues}
              selectedLeagues={selectedLeagues}
              onChange={setSelectedLeagues}
            />
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="match-market-filter"
              className="text-xs font-bold uppercase tracking-wider text-gray-400"
            >
              Market
            </label>
            <select
              id="match-market-filter"
              value={marketFilter}
              onChange={(event) =>
                setMarketFilter(event.target.value as MarketFilter)
              }
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              {MARKET_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <label
              htmlFor="match-market-min-odds"
              className="ml-2 text-xs font-bold uppercase tracking-wider text-gray-400"
            >
              Min odds
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-400">
                @
              </span>
              <input
                id="match-market-min-odds"
                type="number"
                inputMode="decimal"
                min={1.01}
                step={0.01}
                placeholder="Any"
                value={Number.isNaN(minOdds) ? "" : minOdds}
                onChange={(event) =>
                  setMinOdds(
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                  )
                }
                aria-label="Minimum odds"
                className="w-24 rounded-md border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              className={
                sortMode === "hit-rate" ? "text-slate-900" : "text-gray-400"
              }
            >
              Highest Hit Rate
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={sortMode === "edge"}
              aria-label="Sort mode"
              onClick={() =>
                setSortMode((current) =>
                  current === "hit-rate" ? "edge" : "hit-rate",
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${sortMode === "edge" ? "bg-blue-600" : "bg-gray-200"}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${sortMode === "edge" ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
            <span
              className={
                sortMode === "edge" ? "text-slate-900" : "text-gray-400"
              }
            >
              Highest Value Edge
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="min-w-[560px]">
            <div className="hidden grid-cols-12 gap-3 border-b border-gray-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:grid">
              <span className="col-span-5">Selection</span>
              <span className="col-span-2">Market</span>
              <span className="col-span-3">Hit rate · Edge</span>
              <span className="col-span-2 text-right">Odds</span>
            </div>
            <ul>
              {rows.map((prop) => {
                const added = slipIds.has(prop.id);
                return (
                  <li
                    key={`${prop.id}-${prop.match}-${prop.selection}`}
                    className="grid grid-cols-12 items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="col-span-7 flex min-w-0 items-center gap-3 sm:col-span-5">
                      <MatchupBadges
                        match={prop.match}
                        homeTeamImg={prop.homeTeamImg}
                        awayTeamImg={prop.awayTeamImg}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {prop.selection}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {prop.match}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-5 truncate text-right text-xs text-slate-500 sm:col-span-2 sm:text-left">
                      {prop.market}
                    </div>
                    <div className="col-span-7 flex items-center gap-2 sm:col-span-3">
                      <span className="rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                        {prop.hitRate}%
                      </span>
                      <span className="text-xs font-semibold text-blue-600">
                        {signed(prop.edgeScore)}
                      </span>
                    </div>
                    <div className="col-span-5 flex items-center justify-end gap-2 sm:col-span-2">
                      <AddToSlipButton
                        selectionId={prop.id}
                        marketName={prop.selection}
                        decimalOdds={prop.odds}
                        match={prop.match}
                        added={added}
                        onAdd={() => addLeg(prop)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {rows.length === 0 ? (
              <EmptyReason
                className="mx-4 my-6 bg-white"
                variant="center"
                title={source.length === 0 ? "No Book Odds" : "No matching props"}
                detail={
                  source.length === 0
                    ? "No match prop prices stored for today's pre-match fixtures"
                    : "Match props exist, but none match this league, market, or odds floor"
                }
                source={source.length === 0 ? "prematch_odds" : undefined}
              />
            ) : null}
          </div>
        </div>
      </section>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-4 overflow-hidden rounded-xl bg-slate-900 text-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Your Betslip
            </h2>
            <span className="text-xs text-slate-400">
              {activeSlip.length} {activeSlip.length === 1 ? "leg" : "legs"}
            </span>
          </div>
          {activeSlip.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                aria-hidden="true"
                className="mx-auto text-slate-600"
              >
                <rect
                  x="7"
                  y="4"
                  width="22"
                  height="28"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 12h12M12 18h12M12 24h7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <p className="mt-3 text-sm text-slate-400">
                Click a + button to start building your slip.
              </p>
            </div>
          ) : (
            <SlipBody
              legs={activeSlip}
              totalOdds={totalOdds}
              copied={copied}
              onCopy={copySlip}
              onRemove={removeLeg}
            />
          )}
        </div>
      </aside>

      {activeSlip.length > 0 ? (
        <div className="fixed bottom-0 left-0 z-50 w-full rounded-t-xl bg-slate-900 text-white shadow-2xl lg:hidden">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Your Slip ({activeSlip.length})
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total odds
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold tabular-nums text-blue-400">
                {formatOdds(totalOdds) ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen((value) => !value)}
                aria-expanded={drawerOpen}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                {drawerOpen ? "Hide ↓" : "View Slip ↑"}
              </button>
            </div>
          </div>
          {drawerOpen ? (
            <div className="max-h-[60vh] overflow-y-auto border-t border-slate-800">
              <SlipBody
                legs={activeSlip}
                totalOdds={totalOdds}
                copied={copied}
                onCopy={copySlip}
                onRemove={removeLeg}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SlipBody({
  legs,
  totalOdds,
  copied,
  onCopy,
  onRemove,
}: {
  legs: MatchProp[];
  totalOdds: number;
  copied: boolean;
  onCopy: () => void;
  onRemove: (id: number) => void;
}) {
  const { formatOdds } = useDisplayPrefs();
  return (
    <>
      <ul className="divide-y divide-slate-800">
        {legs.map((prop) => (
          <li key={`${prop.id}-${prop.match}-${prop.selection}`} className="flex items-center gap-3 px-4 py-3">
            <MatchupBadges
              match={prop.match}
              homeTeamImg={prop.homeTeamImg}
              awayTeamImg={prop.awayTeamImg}
              size="sm"
              dark
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{prop.selection}</p>
              <p className="truncate text-xs text-slate-400">
                {prop.market} · {prop.match}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {formatOdds(prop.odds) ?? "—"}
            </span>
            <button
              type="button"
              onClick={() => onRemove(prop.id)}
              aria-label={`Remove ${prop.selection} ${prop.match}`}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <path
                  d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-800 px-4 py-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total combined odds
            </p>
            <p className="text-xs text-slate-500">{legs.length}-fold</p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-blue-400">
            {formatOdds(totalOdds) ?? "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            copied
              ? "bg-green-500/15 text-green-400"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {copied ? "Copied ✓" : "Copy to Bookmaker"}
        </button>
      </div>
    </>
  );
}
