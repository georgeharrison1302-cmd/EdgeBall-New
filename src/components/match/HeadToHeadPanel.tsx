import { TeamLogo } from "@/components/TeamLogo";
import { EmptyReason } from "@/components/stats/EmptyReason";
import type { HeadToHead, TeamRef } from "@/lib/stats/match-stats";
import type { Rate } from "@/lib/stats/team-engine";

import { formatAverage, formatMatchDate } from "./format";

/** Past meetings in any competition, framed from the home side. Scores are 90-minute. */
export function HeadToHeadPanel({ h2h, home, away }: { h2h: HeadToHead; home: TeamRef; away: TeamRef }) {
  const { summary, meetings } = h2h;

  if (meetings.length === 0) {
    return (
      <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">Head to head</p>
        <EmptyReason
          className="mt-3"
          variant="panel"
          detail={`No finished meetings between ${home.name} and ${away.name} are stored`}
          source="fixtures"
        />
      </section>
    );
  }

  const total = summary.played;
  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">Head to head</p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-[#0f172a]">
          Last {total} {total === 1 ? "meeting" : "meetings"} · all competitions
        </h2>

        <div className="mt-5 grid grid-cols-3 items-end gap-3 text-center">
          <Outcome team={home} count={summary.wins} total={total} />
          <Outcome label="Draws" count={summary.draws} total={total} />
          <Outcome team={away} count={summary.losses} total={total} />
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#eef3f9]">
          <span className="bg-[#2563eb]" style={{ width: `${(summary.wins / total) * 100}%` }} />
          <span className="bg-[#cbd5e1]" style={{ width: `${(summary.draws / total) * 100}%` }} />
          <span className="bg-[#0f172a]" style={{ width: `${(summary.losses / total) * 100}%` }} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Goals / meeting" value={formatAverage(summary.goals.matchAvg)} sub={`${summary.goals.matchAvg.total} goals`} />
          <RateMetric label="BTTS" rate={summary.goals.btts} />
          <RateMetric label="Over 1.5 goals" rate={summary.goals.over["1.5"]} />
          <RateMetric label="Over 2.5 goals" rate={summary.goals.over["2.5"]} />
        </dl>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
        <p className="border-b border-[#e2e8f0] px-5 py-3 text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
          Previous meetings
        </p>
        <ol className="divide-y divide-[#e2e8f0]">
          {meetings.map((match) => {
            const hosts = match.venue === "home" ? home : match.opponent;
            const visitors = match.venue === "home" ? match.opponent : home;
            const hostGoals = match.venue === "home" ? match.goalsFor : match.goalsAgainst;
            const visitorGoals = match.venue === "home" ? match.goalsAgainst : match.goalsFor;
            const winner = hostGoals === visitorGoals ? null : hostGoals > visitorGoals ? hosts.id : visitors.id;
            return (
              <li key={match.fixtureId} className="grid grid-cols-[5.5rem_1fr_auto_1fr] items-center gap-3 px-5 py-3 text-sm">
                <span className="text-xs text-[#94a3b8]">{formatMatchDate(match.date)}</span>
                <TeamName team={hosts} bold={winner === hosts.id} align="right" />
                <span className="rounded-lg bg-[#eef3f9] px-2.5 py-1 font-black tabular-nums text-[#0f172a]">
                  {hostGoals}–{visitorGoals}
                </span>
                <TeamName team={visitors} bold={winner === visitors.id} align="left" />
              </li>
            );
          })}
        </ol>
      </article>
    </section>
  );
}

function Outcome({ team, label, count, total }: { team?: TeamRef; label?: string; count: number; total: number }) {
  return (
    <div className="min-w-0">
      {team ? (
        <div className="flex items-center justify-center gap-2">
          <TeamLogo src={team.logo} name={team.name} size={22} />
          <span className="truncate text-xs font-bold text-[#64748b]">{team.name} wins</span>
        </div>
      ) : (
        <span className="text-xs font-bold text-[#64748b]">{label}</span>
      )}
      <p className="mt-1 text-3xl font-black tabular-nums text-[#0f172a]">{count}</p>
      <p className="text-[11px] font-semibold text-[#94a3b8]">
        {Math.round((count / total) * 100)}% ({count}/{total})
      </p>
    </div>
  );
}

function RateMetric({ label, rate }: { label: string; rate: Rate }) {
  return (
    <Metric
      label={label}
      value={rate.pct == null ? "—" : `${Math.round(rate.pct)}%`}
      sub={rate.pct == null ? "No sample" : `${rate.hits}/${rate.n} meetings`}
    />
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
      <dt className="text-[11px] font-bold text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 text-xl font-black tabular-nums text-[#0f172a]">{value}</dd>
      <dd className="text-[11px] font-semibold text-[#94a3b8]">{sub}</dd>
    </div>
  );
}

function TeamName({ team, bold, align }: { team: TeamRef; bold: boolean; align: "left" | "right" }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo src={team.logo} name={team.name} size={20} />
      <span className={`truncate ${bold ? "font-black text-[#0f172a]" : "font-semibold text-[#64748b]"}`}>{team.name}</span>
    </span>
  );
}
