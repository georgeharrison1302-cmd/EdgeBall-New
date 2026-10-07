import { TacticalCollision } from "@/components/MatchHub/TacticalCollision";

export type TapeLeader = {
  playerId: number;
  name: string;
  teamId: number;
  rate: number;
  appearances: number | null;
};

export type KeyMatchup = {
  id: string;
  archetype: string;
  narrative: string;
  left: {
    player: TapeLeader;
    role: string;
    teamName: string;
  };
  right: {
    player: TapeLeader;
    role: string;
    teamName: string;
  };
};

export type TaleOfTheTapeData = {
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  keyMatchups: KeyMatchup[];
  shotsOn: { home: TapeLeader[]; away: TapeLeader[] };
  foulsCommitted: { home: TapeLeader[]; away: TapeLeader[] };
  foulsDrawn: { home: TapeLeader[]; away: TapeLeader[] };
};

const SECTIONS: Array<{
  key: keyof Pick<TaleOfTheTapeData, "shotsOn" | "foulsCommitted" | "foulsDrawn">;
  title: string;
  unit: string;
}> = [
  { key: "shotsOn", title: "Shots on Target /90", unit: "SOT/90" },
  { key: "foulsCommitted", title: "Fouls Committed /90", unit: "fouls/90" },
  { key: "foulsDrawn", title: "Fouls Drawn /90", unit: "drawn/90" },
];

/**
 * Season-rate head-to-head — Key Matchup collisions first, leader tables second.
 */
export function TaleOfTheTape({ data }: { data: TaleOfTheTapeData }) {
  const hasLeaders = SECTIONS.some(
    (section) => data[section.key].home.length > 0 || data[section.key].away.length > 0,
  );
  if (!hasLeaders && data.keyMatchups.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Tale of the tape
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Season player rates are not stored for both sides yet (player_season_stats).
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[var(--neon)] uppercase">
            Tale of the tape
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--ink)]">
            {data.homeName} vs {data.awayName}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tactical collisions from season rates — not just side-by-side averages
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-[var(--muted)]">
          <TeamChip name={data.homeName} logo={data.homeLogo} />
          <span>vs</span>
          <TeamChip name={data.awayName} logo={data.awayLogo} />
        </div>
      </div>

      {data.keyMatchups.length > 0 ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] font-extrabold tracking-wide text-[#2563eb] uppercase">
            Tactical collisions
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.keyMatchups.map((matchup) => (
              <TacticalCollision key={matchup.id} matchup={matchup} />
            ))}
          </div>
        </div>
      ) : null}

      {hasLeaders ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <article
              key={section.key}
              className="rounded-xl border border-[var(--line)] bg-[var(--canvas)]/60 p-3.5"
            >
              <p className="text-[11px] font-extrabold tracking-wide text-[var(--cobalt)] uppercase">
                {section.title}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <LeaderColumn
                  team={data.homeName}
                  leaders={data[section.key].home}
                  unit={section.unit}
                />
                <LeaderColumn
                  team={data.awayName}
                  leaders={data[section.key].away}
                  unit={section.unit}
                />
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LeaderColumn({
  team,
  leaders,
  unit,
}: {
  team: string;
  leaders: TapeLeader[];
  unit: string;
}) {
  return (
    <div>
      <p className="truncate text-[10px] font-bold tracking-wide text-[var(--muted)] uppercase">
        {team}
      </p>
      {leaders.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">No rates stored</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {leaders.map((leader, index) => (
            <li key={`${leader.playerId}-${index}`} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-semibold text-[var(--ink)]">
                  <span className="text-[var(--muted)]">{index + 1}. </span>
                  {leader.name}
                </p>
                <p className="shrink-0 text-xs font-bold tabular-nums text-[var(--cobalt)]">
                  {leader.rate.toFixed(2)}
                </p>
              </div>
              <p className="text-[10px] text-[var(--muted)]">
                {unit}
                {leader.appearances != null ? ` · ${leader.appearances} apps` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TeamChip({ name, logo }: { name: string; logo: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-5 object-contain" />
      ) : null}
      <span className="text-[var(--ink)]">{name}</span>
    </span>
  );
}
