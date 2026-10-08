import { TeamLogo } from "@/components/TeamLogo";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { TeamPanel } from "@/lib/stats/match-stats";
import type { TeamStreaks } from "@/lib/stats/team-engine";

import { RESULT_STYLE, formatMatchDate } from "./format";

const STREAKS: Array<{ key: keyof TeamStreaks; label: string }> = [
  { key: "unbeaten", label: "Unbeaten" },
  { key: "winning", label: "Winning" },
  { key: "winless", label: "Without a win" },
  { key: "scoring", label: "Scored in" },
  { key: "btts", label: "BTTS landed" },
  { key: "over25", label: "Over 2.5 landed" },
  { key: "cleanSheet", label: "Clean sheets" },
];

/** A run of 3+ is the threshold where a streak becomes a talking point. */
const HOT = 3;

export function StreaksPanel({ home, away, competition }: { home: TeamPanel; away: TeamPanel; competition: string }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <TeamStreakCard panel={home} competition={competition} />
      <TeamStreakCard panel={away} competition={competition} />
    </section>
  );
}

function TeamStreakCard({ panel, competition }: { panel: TeamPanel; competition: string }) {
  const active = STREAKS.map((streak) => ({ ...streak, length: panel.streaks[streak.key] }))
    .filter((streak) => streak.length > 0)
    .sort((left, right) => right.length - left.length);

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <header className="flex items-center gap-3">
        <TeamLogo src={panel.team.logo} name={panel.team.name} size={32} />
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">Current streaks</p>
          <h3 className="truncate text-base font-black text-ink">{panel.team.name}</h3>
        </div>
      </header>

      {panel.recent.length === 0 ? (
        <EmptyReason
          className="mt-4"
          detail={`No finished ${competition} matches stored for ${panel.team.name} this season`}
          source="fixtures"
        />
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-2">
            {active.length === 0 ? (
              <li className="text-sm text-muted">No active runs — the last result broke every streak.</li>
            ) : (
              active.map((streak) => (
                <li
                  key={streak.key}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                    streak.length >= HOT
                      ? "border-cobalt bg-cobalt text-white"
                      : "border-line bg-canvas text-ink"
                  }`}
                >
                  {streak.label}
                  <span className="tabular-nums">
                    {streak.length} {streak.length === 1 ? "game" : "games"}
                  </span>
                </li>
              ))
            )}
          </ul>

          <p className="mt-5 text-[11px] font-extrabold tracking-wide text-muted uppercase">
            Last {panel.recent.length} · {competition}
          </p>
          <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
            {panel.recent.map((match) => (
              <li key={match.fixtureId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded text-[11px] font-black ${RESULT_STYLE[match.result]}`}>
                  {match.result}
                </span>
                <span className="w-8 shrink-0 text-[11px] font-bold text-faint uppercase">
                  {match.venue === "home" ? "H" : "A"}
                </span>
                <TeamLogo src={match.opponent.logo} name={match.opponent.name} size={18} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{match.opponent.name}</span>
                <span className="font-black tabular-nums text-ink">
                  {match.goalsFor}–{match.goalsAgainst}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-xs text-faint sm:inline">
                  {formatMatchDate(match.date)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}
