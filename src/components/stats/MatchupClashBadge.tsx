/**
 * Discipline collision badge. Both rates must exist and clear 2.0 fouls/game.
 * CTA copy points at Fouls Drawn / Card props — badge remains secondary chrome.
 */
export function MatchupClashBadge({
  foulsDrawnAvg,
  opponentFoulsCommittedAvg,
}: {
  foulsDrawnAvg?: number | null;
  opponentFoulsCommittedAvg?: number | null;
}) {
  if (
    foulsDrawnAvg == null ||
    opponentFoulsCommittedAvg == null ||
    !Number.isFinite(foulsDrawnAvg) ||
    !Number.isFinite(opponentFoulsCommittedAvg) ||
    foulsDrawnAvg < 2 ||
    opponentFoulsCommittedAvg < 2
  ) {
    return null;
  }

  const label = `Clash → Fouls Drawn / Card · draws ${foulsDrawnAvg.toFixed(1)}/g vs ${opponentFoulsCommittedAvg.toFixed(1)}/g-foul`;

  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[var(--cobalt-dark)]"
    >
      {label}
    </span>
  );
}

/** Convenience for callers that still pass a clash DTO. */
export function MatchupClashBadgeFromClash({
  clash,
}: {
  clash?: { playerRate: number; opponentRate: number; label?: string } | null;
}) {
  if (!clash) return null;
  return (
    <MatchupClashBadge
      foulsDrawnAvg={clash.playerRate}
      opponentFoulsCommittedAvg={clash.opponentRate}
    />
  );
}
