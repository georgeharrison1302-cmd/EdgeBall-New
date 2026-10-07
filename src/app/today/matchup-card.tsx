import type { Matchup } from "./matchup";

export function MatchupCard({ matchup }: { matchup: Matchup | null }) {
  if (!matchup) {
    return (
      <section className="rounded-3xl bg-[#0a0a0a] px-5 py-6 text-sm text-zinc-500">
        The duel is not stored for this match (fixture_player_statistics).
      </section>
    );
  }

  const attackerLeads =
    matchup.attacker.perGame !== null &&
    matchup.defender.perGame !== null &&
    matchup.attacker.perGame > matchup.defender.perGame;

  return (
    <section className="rounded-3xl bg-[#0a0a0a] px-4 py-6 text-white">
      <div className="flex items-start justify-center gap-3">
        <Headshot name={matchup.attacker.name} photo={matchup.attacker.photo} />
        <div className="flex min-w-0 flex-1 flex-col items-center pt-3 text-center">
          <div className="flex items-baseline justify-center gap-4">
            <Stat value={matchup.attacker.perGame} superior={attackerLeads} />
            <span className="text-xs text-zinc-600">v</span>
            <Stat value={matchup.defender.perGame} superior={false} />
          </div>
          <div className="mt-2 flex w-full justify-between gap-3 text-[11px] leading-tight text-zinc-500">
            <span className="w-16">{matchup.attacker.label}</span>
            <span className="w-16">{matchup.defender.label}</span>
          </div>
          <p className="mt-3 text-[11px] text-zinc-600">Per game from the stored match log.</p>
        </div>
        <Headshot name={matchup.defender.name} photo={matchup.defender.photo} />
      </div>
    </section>
  );
}

function Headshot({ name, photo }: { name: string; photo: string | null }) {
  return (
    <figure className="w-16 shrink-0 text-center">
      {photo ? (
        <img src={photo} alt="" className="mx-auto h-16 w-16 rounded-full bg-zinc-900 object-cover" />
      ) : (
        <span className="mx-auto block h-16 w-16 rounded-full bg-zinc-900" />
      )}
      <figcaption className="mt-2 text-[11px] leading-tight text-zinc-300">{name}</figcaption>
    </figure>
  );
}

function Stat({ value, superior }: { value: number | null; superior: boolean }) {
  return (
    <span className={`text-2xl font-semibold tracking-tight ${superior ? "text-emerald-400" : "text-zinc-500"}`}>
      {value === null ? "—" : value.toFixed(1)}
    </span>
  );
}
