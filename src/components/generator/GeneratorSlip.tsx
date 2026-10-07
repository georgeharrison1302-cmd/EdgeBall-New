"use client";

import { useDisplayPrefs } from "@/components/display/DisplayPrefsProvider";
import { HitRateStrip } from "@/components/stats/HitRateStrip";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";
import type { GeneratorProp } from "@/components/AdvancedGenerator";
import { effectiveLegOdds } from "@/lib/odds/matcher";

type Props = {
  slip: GeneratorProp[];
  shortfall: number | null;
  legs: number;
  copied: boolean;
  onCopy: () => void;
};

function pricedOdds(odds: number | null | undefined): odds is number {
  return odds != null && Number.isFinite(odds) && odds > 1;
}

/**
 * Generator slip panel — book odds when present, Fair Price (modelOdds) otherwise.
 * Combined total multiplies whichever price is available per leg.
 */
export function GeneratorSlip({ slip, shortfall, legs, copied, onCopy }: Props) {
  const { formatOdds } = useDisplayPrefs();

  const effectiveOdds = slip.map((prop) => effectiveLegOdds(prop.odds, prop.modelOdds));
  const usable = effectiveOdds.filter((odd): odd is number => odd != null);
  const totalOdds = usable.reduce((product, odd) => product * odd, 1);
  const totalOddsLabel =
    usable.length === 0 ? "—" : formatOdds(totalOdds) ?? totalOdds.toFixed(2);
  const mixed = slip.some((prop) => !pricedOdds(prop.odds) && pricedOdds(prop.modelOdds));

  return (
    <>
      {shortfall != null ? (
        <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          Only {shortfall} {shortfall === 1 ? "selection clears" : "selections clear"} those
          filters. Loosen them for a full {legs}-leg slip.
        </p>
      ) : null}
      <ul className="divide-y divide-gray-100">
        {slip.map((prop, index) => (
          <li key={`${prop.id}-${prop.match}-${prop.marketType}-${prop.selection}`} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-50 text-[11px] font-bold text-blue-700">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{prop.selection}</p>
              <p className="truncate text-xs text-gray-500">
                {prop.marketType} · {prop.match}
              </p>
              <p className="text-[11px] text-gray-400">{prop.competition}</p>
              {prop.marketType === "To Be Carded" ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    <StrictRefBadgeFromProfile profile={prop.strictRef} />
                    <MatchupClashBadgeFromClash clash={prop.clash} />
                  </div>
                  <HitRateStrip
                    values={(prop.form ?? []).filter((item): item is boolean => item !== null)}
                    thresholdLabel="Carded"
                    seasonAverage={prop.foulsPerGame ?? null}
                    seasonUnit="/g"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <OddsBadge odds={prop.odds} modelOdds={prop.modelOdds} formatOdds={formatOdds} />
              <span className="rounded-md bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700">
                {prop.hitRate}% hit
                {prop.marketType === "To Be Carded" && prop.foulsPerGame != null
                  ? ` · ${prop.foulsPerGame.toFixed(1)} fouls/g`
                  : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold tracking-wider text-gray-400 uppercase">Total odds</p>
            <p className="text-xs text-gray-500">
              {slip.length}-fold · product of{" "}
              {mixed ? "book + fair prices" : "available leg prices"}
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-blue-600">{totalOddsLabel}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            copied
              ? "bg-green-50 text-green-700"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {copied ? "Copied ✓" : "Copy to Bookmaker"}
        </button>
      </div>
    </>
  );
}

function OddsBadge({
  odds,
  modelOdds,
  formatOdds,
}: {
  odds: number | null;
  modelOdds?: number | null;
  formatOdds: (value: number | null | undefined) => string | null;
}) {
  if (pricedOdds(odds)) {
    return (
      <span className="rounded-md border border-gray-200 px-2 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
        @ {formatOdds(odds) ?? odds.toFixed(2)}
      </span>
    );
  }
  if (pricedOdds(modelOdds)) {
    return (
      <span
        className="rounded-md border border-dashed border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-500"
        title="No bookmaker price stored — implied from hit rate"
      >
        Fair Price: @ {formatOdds(modelOdds) ?? modelOdds.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="rounded-md border border-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-400">
      Unpriced
    </span>
  );
}

/** Combined decimal odds for copy / parent consumers. */
export function slipCombinedOdds(slip: GeneratorProp[]): number | null {
  const odds = slip
    .map((prop) => effectiveLegOdds(prop.odds, prop.modelOdds))
    .filter((odd): odd is number => odd != null);
  if (odds.length === 0) return null;
  return odds.reduce((product, odd) => product * odd, 1);
}
