import { PlayerHeadshot, TeamBadge } from "@/components/assets";
import type { LadderLeg, LadderRun, LadderStep } from "@/lib/ladder/types";
import { splitMatch } from "@/utils/match-name";

export function LadderProgress({ run }: { run: LadderRun }) {
  const start = Number(run.starting_bankroll) || 10;
  const target = Number(run.target_pot) || 1000;
  const pot = Number(run.current_pot) || start;
  const pct = Math.max(0, Math.min(100, ((pot - start) / (target - start)) * 100));

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            Ladder Challenge
          </p>
          <h2 className="mt-0.5 text-xl font-black tracking-tight text-ink">
            £{start.toFixed(0)} → £{target.toLocaleString("en-GB")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            AI rolls a 1.20–2.00 double/single every day. Status:{" "}
            <span className="font-bold text-ink">{run.status}</span>
          </p>
        </div>
        <p className="text-3xl font-black tabular-nums text-ink">£{pot.toFixed(2)}</p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-faint">
        <span>£{start.toFixed(0)}</span>
        <span>Step {run.current_step}</span>
        <span>£{target.toLocaleString("en-GB")}</span>
      </div>
    </section>
  );
}

export function TodaysSelection({ step }: { step: LadderStep | null }) {
  if (!step) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-canvas px-5 py-8 text-center">
        <p className="text-sm font-bold text-ink">No selection stored for today</p>
        <p className="mt-1 text-sm text-muted">
          The ladder cron will insert today&apos;s step when a valid 1.20–2.00 slip clears.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-cobalt uppercase">
            Today&apos;s selection
          </p>
          <h2 className="mt-0.5 text-lg font-black text-ink">
            Step {step.step_number} · {step.date}
          </h2>
        </div>
        <ResultBadge result={step.result} />
      </div>

      <ul className="mt-4 space-y-2">
        {step.legs.map((leg, index) => (
          <LegRow key={`${leg.selection}-${index}`} leg={leg} index={index + 1} />
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Combined" value={step.combined_odds.toFixed(2)} />
        <Stat label="Stake" value={`£${step.stake.toFixed(2)}`} />
        <Stat label="Return" value={`£${step.potential_return.toFixed(2)}`} />
      </dl>
    </section>
  );
}

export function LadderTimeline({ steps }: { steps: LadderStep[] }) {
  if (steps.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">Timeline</h2>
        <p className="mt-2 text-sm text-muted">No ladder steps stored yet for this run.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-ink">Timeline</h2>
      <ol className="mt-4 space-y-3">
        {[...steps].reverse().map((step) => (
          <li
            key={step.id}
            className="rounded-xl border border-line bg-canvas px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-ink">
                Step {step.step_number} · {step.date}
              </p>
              <ResultBadge result={step.result} />
            </div>
            <p className="mt-1 text-xs font-semibold text-muted">
              {step.legs.map((leg) => leg.selection).join(" · ")}
            </p>
            <p className="mt-1 text-xs font-bold tabular-nums text-ink">
              @{step.combined_odds.toFixed(2)} · stake £{step.stake.toFixed(2)} → £
              {step.potential_return.toFixed(2)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LadderHistory({ runs }: { runs: LadderRun[] }) {
  if (runs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-ink">Past runs</h2>
      <ul className="mt-3 divide-y divide-line">
        {runs.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-bold text-ink">
                {new Date(run.started_at).toLocaleDateString("en-GB")} · {run.status}
              </p>
              <p className="text-xs text-muted">
                Peak pot £{Number(run.current_pot).toFixed(2)} · step {run.current_step}
              </p>
            </div>
            <ResultBadge result={run.status === "completed" ? "won" : run.status === "busted" ? "lost" : "pending"} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LegRow({ leg, index }: { leg: LadderLeg; index: number }) {
  const [home, away] = splitMatch(leg.match);
  const playerName = leg.player?.trim() || null;

  return (
    <li className="rounded-xl border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-start gap-3">
        {playerName ? (
          <PlayerHeadshot
            playerId={leg.player_id}
            playerName={playerName}
            size={40}
          />
        ) : (
          <div className="flex shrink-0 items-center">
            <TeamBadge teamName={home || leg.match} size={32} className="z-10 ring-2 ring-canvas" />
            {away ? (
              <TeamBadge teamName={away} size={32} className="-ml-2 ring-2 ring-canvas" />
            ) : null}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold tracking-wide text-faint uppercase">
            Leg {index} · {leg.market}
          </p>
          <p className="mt-0.5 text-sm font-extrabold text-ink">{leg.selection}</p>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <TeamBadge teamName={home || leg.match} size={18} />
            {away ? <TeamBadge teamName={away} size={18} /> : null}
            <p className="truncate text-xs font-semibold text-muted">{leg.match}</p>
          </div>
          <p className="mt-1 text-xs font-bold tabular-nums text-ink">
            @{leg.odds.toFixed(2)} · {leg.hit_rate}% hit rate
          </p>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas px-2 py-2">
      <dt className="text-[10px] font-bold tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function ResultBadge({ result }: { result: string }) {
  const styles =
    result === "won" || result === "completed"
      ? "bg-emerald-500 text-white"
      : result === "lost" || result === "busted"
        ? "bg-red-500 text-white"
        : result === "void"
          ? "bg-slate-400 text-white"
          : "bg-[#eff6ff] text-cobalt";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ${styles}`}>
      {result}
    </span>
  );
}
