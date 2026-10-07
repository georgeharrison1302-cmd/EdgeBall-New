/**
 * Strict-ref narrative badge. Hidden unless cards/game clear 4.0 from stored evidence.
 * CTA copy opens Card props — badge remains secondary chrome.
 */
export function StrictRefBadge({
  refereeName,
  cardsPerGame,
  leagueAvgCards,
}: {
  refereeName?: string | null;
  cardsPerGame?: number | null;
  leagueAvgCards?: number | null;
}) {
  if (cardsPerGame == null || !Number.isFinite(cardsPerGame) || cardsPerGame <= 4) {
    return null;
  }

  const name = refereeName?.trim() || "Referee";
  const pctOverAvg =
    leagueAvgCards != null && Number.isFinite(leagueAvgCards) && leagueAvgCards > 0
      ? Math.round(((cardsPerGame - leagueAvgCards) / leagueAvgCards) * 100)
      : null;

  const profile =
    pctOverAvg == null
      ? `${name} · ${cardsPerGame.toFixed(1)} cards/m`
      : `${name} · ${cardsPerGame.toFixed(1)} cards/m · ${pctOverAvg >= 0 ? "+" : ""}${pctOverAvg}% vs avg`;
  const label = `Strict ref → open Card props · ${profile}`;

  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900"
    >
      {label}
    </span>
  );
}

/** Convenience when callers still hold a derived referee profile object. */
export function StrictRefBadgeFromProfile({
  ref,
}: {
  ref?: { name: string; avg: number; vsLeaguePct?: number | null; matches?: number } | null;
}) {
  if (!ref) return null;
  const leagueAvg =
    ref.vsLeaguePct == null || !Number.isFinite(ref.vsLeaguePct) || ref.avg === 0
      ? null
      : ref.avg / (1 + ref.vsLeaguePct / 100);
  return (
    <StrictRefBadge
      refereeName={ref.name}
      cardsPerGame={ref.avg}
      leagueAvgCards={leagueAvg}
    />
  );
}
