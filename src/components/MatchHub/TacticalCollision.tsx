import type { KeyMatchup } from "@/components/MatchHub/TaleOfTheTape";

export type CollisionCardData = KeyMatchup & {
  match?: string;
  fixtureId?: number;
  competition?: string;
};

/**
 * Direct player-vs-player collision — Foul Magnet vs Aggressor style.
 */
export function TacticalCollision({ matchup }: { matchup: CollisionCardData }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#dbeafe] bg-gradient-to-br from-[#eff6ff] via-white to-[#eff6ff] p-4 shadow-sm">
      {matchup.match ? (
        <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
          {matchup.competition ? `${matchup.competition} · ` : ""}
          {matchup.match}
        </p>
      ) : (
        <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
          Key matchup
        </p>
      )}
      <h3 className="mt-1 text-base font-black tracking-tight text-ink">
        {matchup.archetype}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">{matchup.narrative}</p>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <Side side={matchup.left} align="left" />
        <div className="flex items-center justify-center">
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold tracking-wide text-muted uppercase ring-1 ring-line">
            vs
          </span>
        </div>
        <Side side={matchup.right} align="right" />
      </div>
    </article>
  );
}

function Side({
  side,
  align,
}: {
  side: KeyMatchup["left"];
  align: "left" | "right";
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-white/90 px-3 py-3 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <p className="text-[10px] font-extrabold tracking-wide text-muted uppercase">
        {side.role}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-ink">{side.player.name}</p>
      <p className="truncate text-[11px] text-muted">{side.teamName}</p>
      <p className="mt-2 text-lg font-black tabular-nums text-cobalt">
        {side.player.rate.toFixed(2)}
        <span className="ml-1 text-xs font-semibold text-muted">/90</span>
      </p>
      {side.player.appearances != null ? (
        <p className="text-[10px] text-faint">{side.player.appearances} apps</p>
      ) : null}
    </div>
  );
}
