import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isTargetLeagueId } from "@/utils/api-football/competitions";
import { loadPlayerAvailability, loadPlayerTransfers, loadPlayerTrophies } from "../../../club-extras";
import { leagueTitle, listSelectableSeasons, loadPlayer, parseSeason, type PlayerSpell } from "../../../data";
import { formHits, hitRates, loadMatchLog, type MatchLogRow } from "../../../match-log";
import { loadPlayerCardAngle } from "../../../player-angles";
import { Stat } from "../../../ui";
import { HitRateStrip } from "@/components/stats/HitRateStrip";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { PoissonVsBook } from "@/components/stats/PoissonVsBook";
import { PlayerBreakdown } from "@/components/stats/PlayerBreakdown";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string; playerId: string }>;
  searchParams: Promise<{ season?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { leagueId } = await params;
  const league = Number(leagueId);
  if (!Number.isInteger(league)) return { title: "Player · EdgeBall" };
  const name = await leagueTitle(league);
  return { title: name ? `Player · ${name} · EdgeBall` : "Player · EdgeBall" };
}

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const { leagueId, playerId } = await params;
  const { season: seasonParam } = await searchParams;
  const league = Number(leagueId);
  const player = Number(playerId);
  if (!Number.isInteger(league) || !Number.isInteger(player)) notFound();
  const season = parseSeason(seasonParam, await listSelectableSeasons(league));
  const [page, log, transfers, trophies, availability] = await Promise.all([
    loadPlayer(league, player, season),
    loadMatchLog(player, 10),
    loadPlayerTransfers(player),
    loadPlayerTrophies(player),
    loadPlayerAvailability(player, league, season),
  ]);
  const spell = page.spells[0] ?? page.combined;
  const angle = await loadPlayerCardAngle(
    player,
    [...new Set(page.spells.map((item) => item.teamId).filter((id) => id > 0))],
    page.position ?? spell?.position ?? null,
    spell?.foulsWon ?? null,
    spell?.appearances ?? null,
  );

  return (
    <div>
      <p className="text-sm text-[#64748b]">
        <Link href="/competitions" className="text-[#2563eb]">
          Competitions
        </Link>
        <span> / </span>
        <Link href={`/competitions/${page.leagueId}?season=${season}`} className="text-[#2563eb]">
          {page.league}
        </Link>
      </p>
      <div className="mt-3 flex items-center gap-3">
        {page.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover bg-[#e2e8f0]" />
        ) : (
          <span className="h-16 w-16 rounded-full bg-[#e2e8f0]" />
        )}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{page.name}</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            {[page.position, page.age === null ? null : String(page.age), page.nationality, measure(page.height, "cm"), measure(page.weight, "kg")]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {page.injured ? <p className="mt-1 text-sm font-semibold text-amber-700">Unavailable</p> : null}
        </div>
      </div>

      {page.stored ? null : (
        <p className="mt-5 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4 text-sm text-[#64748b]">
          Season totals are not stored for {season}.
        </p>
      )}

      <PlayerAnglePanel angle={angle} log={log} spell={spell} />

      <div className="mt-6 space-y-8">
        {page.competitions.map((competition) => (
          <section key={competition.leagueId}>
            <h2 className="text-lg font-semibold">
              {isTargetLeagueId(competition.leagueId) ? (
                <Link href={`/competitions/${competition.leagueId}?season=${season}`} className="text-[#2563eb]">
                  {competition.league}
                </Link>
              ) : (
                competition.league
              )}
            </h2>
            <div className="mt-4 space-y-6">
              {competition.spells.map((spell) => (
                <Spell key={`${competition.leagueId}-${spell.teamId}`} leagueId={competition.leagueId} season={season} spell={spell} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {page.combined ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">All competitions</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Added from each competition stored for {season}. Pass accuracy stays with its own competition. A blank figure is left out.
          </p>
          <SpellStats spell={page.combined} />
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Trophies</h2>
        {trophies.length === 0 ? (
          <p className="mt-2 text-sm text-[#64748b]">Trophies are not stored.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
            {trophies.map((line, index) => (
              <li key={`${line}-${index}`} className="px-4 py-3 text-sm">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Sidelined</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Stored injury and suspension history. An end date of Unknown means no return date was confirmed.
          {availability.overlap === "counted"
            ? ` Missed ${availability.missed} stored ${season} ${availability.missed === 1 ? "match" : "matches"} while a spell covered the kickoff.`
            : availability.overlap === "unsheeted"
              ? " Finished matches fall inside a spell, and those fixtures have no stored player sheet, so they are not counted."
              : ""}
        </p>
        {availability.rated.length > 0 ? (
          <p className="mt-1 text-sm text-[#64748b]">Ratings from stored appearances this season: {availability.rated.join(", ")}</p>
        ) : null}
        {availability.spells.length === 0 ? (
          <p className="mt-2 text-sm text-[#64748b]">Sidelined spells are not stored.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
            {availability.spells.map((spell, index) => (
              <li key={`${spell.type}-${spell.start}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{spell.type ?? "Sidelined"}</span>
                <span className="text-[#64748b]">
                  {spell.start ?? ""}
                  {spell.start || spell.end ? " – " : ""}
                  {spell.end ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Transfers</h2>
        {transfers.length === 0 ? (
          <p className="mt-2 text-sm text-[#64748b]">Transfers are not stored.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
            {transfers.map((line, index) => (
              <li key={`${line}-${index}`} className="px-4 py-3 text-sm">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
      <MatchLog rows={log} />
    </div>
  );
}

function Spell({
  leagueId,
  season,
  spell,
}: {
  leagueId: number;
  season: number;
  spell: PlayerSpell;
}) {
  return (
    <section>
      <Link
        href={`/competitions/${leagueId}/teams/${spell.teamId}?season=${season}`}
        className="flex items-center gap-2 font-semibold"
      >
        {spell.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spell.logoUrl} alt="" className="h-6 w-6 object-contain" />
        ) : null}
        {spell.team}
      </Link>
      <SpellStats spell={spell} />
    </section>
  );
}

function SpellStats({ spell }: { spell: PlayerSpell }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Appearances" value={spell.appearances} />
      <Stat label="Minutes" value={spell.minutes} />
      <Stat label="Goals" value={spell.goals} />
      <Stat label="Assists" value={spell.assists} />
      <Stat label="Shots" value={spell.shots} />
      <Stat label="Shots on target" value={spell.shotsOn} />
      <Stat label="Passes" value={spell.passes} />
      <Stat label="Key passes" value={spell.keyPasses} />
      <Stat label="Pass accuracy" value={spell.passAccuracy === null ? null : `${spell.passAccuracy}%`} />
      <Stat label="Tackles" value={spell.tackles} />
      <Stat label="Dribbles" value={spell.dribbles} />
      <Stat label="Fouls committed" value={spell.foulsCommitted} />
      <Stat label="Fouls won" value={spell.foulsWon} />
      <Stat label="Fouls/90" value={rate(spell.foulsPer90)} />
      <Stat label="Tackles/90" value={rate(spell.tacklesPer90)} />
      <Stat label="Cards/game" value={rate(spell.cardsPerGame)} />
      <Stat label="Yellow cards" value={spell.yellow} />
      <Stat label="Red cards" value={spell.red} />
      <Stat label="Penalties scored" value={spell.penaltyScored} />
      <Stat label="Penalties missed" value={spell.penaltyMissed} />
      <Stat label="Penalties saved" value={spell.penaltySaved} />
    </div>
  );
}

function measure(value: string | null, unit: string) {
  if (!value) return null;
  return /[a-z]/i.test(value) ? value : `${value} ${unit}`;
}

function MatchLog({ rows }: { rows: MatchLogRow[] }) {
  const lastFive = rows.slice(0, 5);
  const carded = formHits(rows, "card");
  const foul2 = formHits(rows, "foul2");
  const sot = formHits(rows, "sot");
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Match log</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[#64748b]">Match log is not stored.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <HitRateStrip values={recorded(carded)} thresholdLabel="Carded" />
            <HitRateStrip values={recorded(foul2)} thresholdLabel="hit 2+ fouls" />
            <HitRateStrip values={recorded(sot)} thresholdLabel="had 1+ SOT" />
          </div>
          <Rates title="Last five" rows={lastFive} />
          <div className="mt-3">
            <PlayerBreakdown rows={lastFive} />
          </div>
        </>
      )}
    </section>
  );
}

function recorded(form: Array<boolean | null>) {
  return form.filter((item): item is boolean => item !== null);
}

function rate(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(1);
}

function PlayerAnglePanel({
  angle,
  log,
  spell,
}: {
  angle: Awaited<ReturnType<typeof loadPlayerCardAngle>>;
  log: MatchLogRow[];
  spell: PlayerSpell | null | undefined;
}) {
  const carded = formHits(log, "card");
  return (
    <section className="mt-6 rounded-2xl border border-[#e2e8f0] bg-white p-5">
      <h2 className="text-lg font-semibold">Betting angle</h2>
      <p className="mt-1 text-sm text-[#64748b]">
        {spell?.cardsPerGame != null ? `${spell.cardsPerGame.toFixed(1)} cards/game` : "Cards/game is not stored."}
        {spell?.foulsPer90 != null ? ` · ${spell.foulsPer90.toFixed(1)} fouls/90` : ""}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StrictRefBadgeFromProfile ref={angle?.strictRef} />
        <MatchupClashBadgeFromClash clash={angle?.clash} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">Last-5 cards</p>
          <div className="mt-2">
            <HitRateStrip values={recorded(carded)} thresholdLabel="Carded" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-extrabold tracking-wide text-[#64748b] uppercase">
            {angle ? `To be booked · ${angle.match}` : "Next book price"}
          </p>
          <div className="mt-2">
            {angle ? (
              <PoissonVsBook
                modelProb={angle.modelProb}
                decimalOdds={angle.odd}
                edgePct={angle.edgePct}
              />
            ) : (
              <p className="text-xs text-[#64748b]">No upcoming priced fixture stored.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Rates({ title, rows }: { title: string; rows: MatchLogRow[] }) {
  const rates = hitRates(rows);
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rates.length === 0 ? (
        <p className="mt-1 text-sm text-[#64748b]">Hit rate is not stored for these games.</p>
      ) : (
        <p className="mt-1 text-sm text-[#64748b]">
          {rates.map((rate) => `${rate.label} ${rate.hits}/${rate.games}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
