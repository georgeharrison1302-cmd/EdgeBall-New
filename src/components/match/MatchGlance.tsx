import type { TeamPanel } from "@/lib/stats/match-stats";
import type { Rate, TeamStatSummary } from "@/lib/stats/team-engine";

import { formatAverage } from "./format";

type Glance = { label: string; pick: (summary: TeamStatSummary) => Rate };

const GLANCES: Glance[] = [
  { label: "BTTS", pick: (summary) => summary.goals.btts },
  { label: "Over 2.5", pick: (summary) => summary.goals.over["2.5"] },
  { label: "Clean sheet", pick: (summary) => summary.goals.cleanSheet },
  { label: "Over 9.5 corners", pick: (summary) => summary.sheets.cornersOver["9.5"] },
];

/** Venue split (home side at home, away side away) — the split bookmakers price. */
export function MatchGlance({ home, away, competition }: { home: TeamPanel; away: TeamPanel; competition: string }) {
  const left = home.splits.venue;
  const right = away.splits.venue;

  return (
    <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">At a glance</p>
          <h2 className="mt-1 text-base font-black text-[#0f172a]">
            {home.team.name} at home vs {away.team.name} away
          </h2>
        </div>
        <p className="text-xs font-semibold text-[#94a3b8]">
          {competition} · {left.played} vs {right.played} matches
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Points / game" left={left.ppg?.toFixed(2) ?? "—"} right={right.ppg?.toFixed(2) ?? "—"} />
        {GLANCES.map((glance) => (
          <RateTile key={glance.label} label={glance.label} left={glance.pick(left)} right={glance.pick(right)} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#94a3b8]">
        Match goals / game: {formatAverage(left.goals.matchAvg)} vs {formatAverage(right.goals.matchAvg)} · percentages show
        hits / matches played.
      </p>
    </section>
  );
}

function RateTile({ label, left, right }: { label: string; left: Rate; right: Rate }) {
  const show = (rate: Rate) => (rate.pct == null ? "—" : `${Math.round(rate.pct)}%`);
  const sample = (rate: Rate) => (rate.pct == null ? "no data" : `${rate.hits}/${rate.n}`);
  return <Tile label={label} left={show(left)} right={show(right)} leftSub={sample(left)} rightSub={sample(right)} />;
}

function Tile({
  label,
  left,
  right,
  leftSub,
  rightSub,
}: {
  label: string;
  left: string;
  right: string;
  leftSub?: string;
  rightSub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
      <p className="text-[11px] font-bold text-[#64748b]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2 tabular-nums">
        <span>
          <span className="block text-lg font-black text-[#0f172a]">{left}</span>
          {leftSub ? <span className="text-[10px] font-semibold text-[#94a3b8]">{leftSub}</span> : null}
        </span>
        <span className="text-right">
          <span className="block text-lg font-black text-[#0f172a]">{right}</span>
          {rightSub ? <span className="text-[10px] font-semibold text-[#94a3b8]">{rightSub}</span> : null}
        </span>
      </div>
    </div>
  );
}
