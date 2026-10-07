import type { SeasonProof } from "./types";

type MarketHint = "cards" | "fouls" | "sot" | "goals" | "other";

/**
 * Compact season-rate chips from player_season_stats fields.
 * Secondary under the priced selection — never the card hero.
 */
export function SeasonProofBadges({
  proof,
  market = "other",
}: {
  proof?: SeasonProof | null;
  market?: MarketHint;
}) {
  if (!proof) {
    return <span className="text-[11px] text-[var(--muted)]">Season proof not stored</span>;
  }

  const badges = buildBadges(proof, market);
  if (badges.length === 0) {
    return <span className="text-[11px] text-[var(--muted)]">Season proof not stored</span>;
  }

  return (
    <div className="flex min-h-[1.25rem] flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--ink)] ring-1 ring-[var(--line)]"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

function buildBadges(proof: SeasonProof, market: MarketHint): string[] {
  const badges: string[] = [];
  const apps = proof.appearances;

  if (market === "cards" || market === "fouls") {
    if (proof.foulsPer90 != null) badges.push(`${proof.foulsPer90.toFixed(1)} fouls/90`);
    if (proof.foulsDrawnPer90 != null) badges.push(`${proof.foulsDrawnPer90.toFixed(1)} drawn/90`);
    if (proof.yellows != null && apps != null) {
      badges.push(`${proof.yellows} yellows in ${apps} apps`);
    } else if (proof.yellows != null) {
      badges.push(`${proof.yellows} yellows`);
    }
    if (proof.tacklesPer90 != null) badges.push(`${proof.tacklesPer90.toFixed(1)} tackles/90`);
  } else if (market === "sot" || market === "goals") {
    if (proof.sotPer90 != null) badges.push(`${proof.sotPer90.toFixed(1)} SOT/90`);
    if (proof.goals != null && apps != null) {
      badges.push(`${proof.goals} goals in ${apps} apps`);
    } else if (proof.goals != null) {
      badges.push(`${proof.goals} goals`);
    }
  } else {
    if (proof.foulsPer90 != null) badges.push(`${proof.foulsPer90.toFixed(1)} fouls/90`);
    if (proof.sotPer90 != null) badges.push(`${proof.sotPer90.toFixed(1)} SOT/90`);
    if (proof.yellows != null && apps != null) {
      badges.push(`${proof.yellows} yellows in ${apps} apps`);
    }
  }
  return badges;
}
