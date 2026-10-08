import Link from "next/link";

import { TeamBadge } from "@/components/assets";

import { FactorBadge } from "@/components/factors/FactorBadge";
import { HeadToHeadPanel } from "@/components/match/HeadToHeadPanel";
import { MatchGlance } from "@/components/match/MatchGlance";
import { MatchTabs } from "@/components/match/MatchTabs";
import { StreaksPanel } from "@/components/match/StreaksPanel";
import { TeamStatsComparison } from "@/components/match/TeamStatsComparison";
import { TaleOfTheTape } from "@/components/MatchHub/TaleOfTheTape";
import { TopValueAngles } from "@/components/MatchHub/TopValueAngles";
import { CardMeter } from "@/components/stats/CardMeter";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { GameScriptBadge } from "@/components/stats/GameScriptBadge";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import { loadMatchStats } from "@/lib/stats/match-stats-load";
import { getSubscriptionAccess } from "@/utils/subscription";

import { HubCardBoard } from "./hub-card-board";
import {
  loadFixtureAvailability,
  loadFixtureLineups,
  type FixtureAvailability,
  type TeamLineup,
} from "./hub-availability";
import type { MatchHubPage } from "./hub-load";
import { MatchOddsPills } from "./match-odds-pills";

export default async function MatchHubView({
  hub,
  initialTab,
}: {
  hub: MatchHubPage;
  initialTab?: string;
}) {
  const [access, stats, availability, lineups] = await Promise.all([
    getSubscriptionAccess(),
    loadMatchStats({ leagueId: hub.leagueId, season: hub.season, home: hub.home, away: hub.away }).catch(
      (cause: unknown) => {
        console.error(`[match-stats] fixture ${hub.id}:`, cause);
        return null;
      },
    ),
    loadFixtureAvailability(hub.home.id, hub.away.id, hub.kickoffAt).catch((cause: unknown) => {
      console.error(`[availability] fixture ${hub.id}:`, cause);
      return null;
    }),
    loadFixtureLineups(hub.id).catch((cause: unknown) => {
      console.error(`[lineups] fixture ${hub.id}:`, cause);
      return [] as TeamLineup[];
    }),
  ]);
  const statsMissing = (
    <EmptyReason
      variant="panel"
      detail="Team stats could not be loaded for this fixture"
      source="fixtures / fixture_statistics"
    />
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        <Link href="/" className="font-semibold text-[var(--cobalt)]">
          Match Hub
        </Link>
        <span> / </span>
        <Link
          href={`/competitions/${hub.leagueId}?season=${hub.season}`}
          className="font-semibold text-[var(--cobalt)]"
        >
          {hub.competition}
        </Link>
      </p>

      <Hero hub={hub} unlocked={access.unlocked} />

      <MatchTabs
        initial={initialTab}
        scoreboard={<ScoreStrip hub={hub} />}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <>
                {stats ? <MatchGlance home={stats.home} away={stats.away} competition={hub.competition} /> : statsMissing}
                <ContextStrip hub={hub} />
                <AvailabilityPanel hub={hub} availability={availability} />
                <DisciplineGauge hub={hub} />
              </>
            ),
          },
          {
            id: "stats",
            label: "Team stats",
            content: stats ? (
              <>
                <TeamStatsComparison home={stats.home} away={stats.away} competition={hub.competition} />
                <StreaksPanel home={stats.home} away={stats.away} competition={hub.competition} />
              </>
            ) : (
              statsMissing
            ),
          },
          {
            id: "lineups",
            label: "Lineups",
            content: <LineupsPanel hub={hub} lineups={lineups} />,
          },
          {
            id: "h2h",
            label: "H2H",
            content: stats ? <HeadToHeadPanel h2h={stats.h2h} home={hub.home} away={hub.away} /> : statsMissing,
          },
          {
            id: "props",
            label: "Player props",
            content: (
              <>
                <PremiumPaywall unlocked={access.unlocked}>
                  <TopValueAngles rows={hub.propBoard} fixtureId={hub.id} unlocked={access.unlocked} />
                </PremiumPaywall>
                <PremiumPaywall unlocked={access.unlocked}>
                  <TaleOfTheTape data={hub.taleOfTheTape} />
                </PremiumPaywall>
                <HubCardBoard
                  rows={hub.propBoard}
                  home={hub.home.name}
                  away={hub.away.name}
                  fixtureId={hub.id}
                  factors={hub.factors}
                  unlocked={access.unlocked}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

function Hero({ hub, unlocked }: { hub: MatchHubPage; unlocked: boolean }) {
  const triggered = hub.factors.filter((factor) => factor.matched);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
      <div
        className="px-6 py-7"
        style={{
          background:
            "linear-gradient(135deg, var(--canvas) 0%, #ffffff 45%, #ecfeff 100%)",
        }}
      >
        <p className="text-center text-[11px] font-extrabold tracking-wide text-[var(--cobalt)] uppercase">
          {hub.competition}
        </p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamBlock team={hub.home} align="left" leagueId={hub.leagueId} />
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase">
              {hub.score ? "Score" : "Kick-off"}
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight tabular-nums text-[var(--ink)]">
              {hub.score ? `${hub.score.home} – ${hub.score.away}` : hub.kickoff}
            </p>
            {hub.score ? <p className="mt-1 text-xs text-[var(--muted)]">{hub.kickoff}</p> : null}
            {hub.status ? <StatusPill status={hub.status} /> : null}
          </div>
          <TeamBlock team={hub.away} align="right" leagueId={hub.leagueId} />
        </div>
        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          {[hub.venue ?? "Venue TBC", hub.referee ? `Ref: ${hub.referee}` : "Ref: TBC"].join(" · ")}
        </p>
        {triggered.length > 0 ? (
          <PremiumPaywall
            unlocked={unlocked}
            tease="Unlock Fixture Factors for this matchup"
            className="mt-4"
          >
            <div className="flex flex-wrap justify-center gap-2">
              {triggered.map((evaluation) => (
                <FactorBadge key={evaluation.factor.id} evaluation={evaluation} />
              ))}
            </div>
          </PremiumPaywall>
        ) : null}
      </div>
      <div className="border-t border-[var(--line)] px-6 py-5">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Bet365 match markets
        </p>
        <MatchOddsPills
          odds={hub.odds}
          home={hub.home.name}
          away={hub.away.name}
          fixtureId={hub.id}
        />
      </div>
    </section>
  );
}

function LineupsPanel({ hub, lineups }: { hub: MatchHubPage; lineups: TeamLineup[] }) {
  const sides = [
    { name: hub.home.name, lineup: lineups.find((row) => row.teamId === hub.home.id) },
    { name: hub.away.name, lineup: lineups.find((row) => row.teamId === hub.away.id) },
  ];
  if (sides.every((side) => !side.lineup || side.lineup.startXi.length === 0)) {
    return (
      <EmptyReason
        variant="panel"
        title="Lineups not confirmed yet"
        detail="Starting XIs are published about 90 minutes before kickoff"
        source="fixture_lineups"
      />
    );
  }
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {sides.map((side) => (
        <div key={side.name} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-ink">
            {side.name}
            {side.lineup?.formation ? (
              <span className="ml-2 text-xs font-bold text-[var(--cobalt)]">{side.lineup.formation}</span>
            ) : null}
          </p>
          {!side.lineup || side.lineup.startXi.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">No lineup stored for this side.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-1.5">
                {side.lineup.startXi.map((player) => (
                  <li key={`${player.id}-${player.name}`} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-right text-xs font-bold text-[var(--muted)] tabular-nums">
                      {player.number ?? ""}
                    </span>
                    <span className="font-semibold text-slate-900">{player.name}</span>
                    {player.pos ? (
                      <span className="text-[11px] font-medium text-[var(--muted)]">{player.pos}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {side.lineup.substitutes.length > 0 ? (
                <p className="mt-3 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                  <span className="font-bold uppercase tracking-wide">Bench: </span>
                  {side.lineup.substitutes.map((player) => player.name).join(", ")}
                </p>
              ) : null}
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function AvailabilityPanel({
  hub,
  availability,
}: {
  hub: MatchHubPage;
  availability: FixtureAvailability | null;
}) {
  const total = availability ? availability.home.length + availability.away.length : 0;
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
        Team news · absences
      </p>
      {!availability || total === 0 ? (
        <EmptyReason
          className="mt-3"
          detail="No current injury or suspension spells stored for either squad"
          source="player_sidelined"
        />
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {[
            { name: hub.home.name, rows: availability.home },
            { name: hub.away.name, rows: availability.away },
          ].map((side) => (
            <div key={side.name}>
              <p className="text-sm font-semibold text-ink">{side.name}</p>
              {side.rows.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--muted)]">No stored absences.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {side.rows.map((row) => (
                    <li key={`${row.playerId}-${row.type}`} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-600">
                        ×
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.player}
                          {row.position ? (
                            <span className="ml-1.5 text-[11px] font-medium text-[var(--muted)]">
                              {row.position}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {row.type} · since {row.since ?? "unknown"} ·{" "}
                          {row.until ? `until ${row.until}` : "return date unknown"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContextStrip({ hub }: { hub: MatchHubPage }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
        Match context
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StrictRefBadgeFromProfile profile={hub.refereeProfile} />
        <MatchupClashBadgeFromClash clash={hub.clash} />
        <GameScriptBadge script={hub.gameScript} />
      </div>
      <div className="mt-4">
        <CardMeter
          home={hub.homeYellowsPerGame}
          away={hub.awayYellowsPerGame}
          homeName={hub.home.name}
          awayName={hub.away.name}
        />
      </div>
      {!hub.refereeProfile && !hub.clash && !hub.gameScript && hub.homeYellowsPerGame == null ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Context badges appear when referee cards clear 4.0/game, foul clash clears 2.0/g both sides, or
          card/sheet scripts clear their thresholds.
        </p>
      ) : null}
    </section>
  );
}

function TeamBlock({
  team,
  align,
  leagueId,
}: {
  team: MatchHubPage["home"];
  align: "left" | "right";
  leagueId: number;
}) {
  return (
    <Link
      href={`/competitions/${leagueId}/teams/${team.id}`}
      className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <TeamBadge src={team.logo} teamId={team.id} teamName={team.name} size={48} />
      <p className="min-w-0 truncate text-sm font-bold text-ink sm:text-base">{team.name}</p>
    </Link>
  );
}

const LIVE_CODES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);

function StatusPill({ status }: { status: string }) {
  const live = LIVE_CODES.has(status);
  return (
    <span
      className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        live ? "bg-red-50 text-red-600" : status === "NS" ? "bg-canvas text-muted" : "bg-slate-100 text-ink"
      }`}
    >
      {live ? "LIVE" : status === "NS" ? "Not started" : status}
    </span>
  );
}

function ScoreStrip({ hub }: { hub: MatchHubPage }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate font-bold text-ink">{hub.home.name}</span>
        <TeamBadge src={hub.home.logo} teamId={hub.home.id} teamName={hub.home.name} size={24} />
      </div>
      <span className="shrink-0 rounded-lg bg-canvas px-3 py-1 text-sm font-black tabular-nums text-ink">
        {hub.score ? `${hub.score.home} – ${hub.score.away}` : hub.kickoff}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamBadge src={hub.away.logo} teamId={hub.away.id} teamName={hub.away.name} size={24} />
        <span className="truncate font-bold text-ink">{hub.away.name}</span>
      </div>
    </div>
  );
}

function DisciplineGauge({ hub }: { hub: MatchHubPage }) {
  const ref = hub.refereeProfile;
  const collision = hub.foulCollision;
  const hasCollision =
    (collision.homeCommitted != null && collision.awayDrawn != null) ||
    (collision.awayCommitted != null && collision.homeDrawn != null);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Referee card profile
        </p>
        {ref ? (
          <div className="mt-3 space-y-3">
            <StrictRefBadgeFromProfile profile={ref} />
            <p className="text-2xl font-bold text-[var(--ink)]">
              {ref.avg.toFixed(1)}{" "}
              <span className="text-base font-semibold text-[var(--muted)]">cards/match</span>
            </p>
            <p className="text-sm text-[var(--muted)]">
              {ref.name}
              {ref.vsLeaguePct != null
                ? ` · ${ref.vsLeaguePct >= 0 ? "+" : ""}${ref.vsLeaguePct}% vs league avg`
                : " · league average not stored yet"}
              {ref.matches > 0 ? ` · ${ref.matches} finished matches with card stats` : ""}
            </p>
          </div>
        ) : (
          <EmptyReason
            className="mt-3"
            detail={
              hub.referee
                ? `${hub.referee} is assigned, but card averages are not stored yet`
                : "Referee is not stored for this fixture"
            }
            source={hub.referee ? "fixture_statistics" : "fixtures"}
          />
        )}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <p className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
          Team foul collision
        </p>
        {hasCollision ? (
          <div className="mt-3 space-y-3 text-sm">
            <MatchupClashBadgeFromClash clash={hub.clash} />
            {collision.homeCommitted != null && collision.awayDrawn != null ? (
              <CollisionLine
                left={`${hub.home.name} commit ${collision.homeCommitted.toFixed(1)}/90`}
                right={`${hub.away.name} draw ${collision.awayDrawn.toFixed(1)}/90`}
              />
            ) : null}
            {collision.awayCommitted != null && collision.homeDrawn != null ? (
              <CollisionLine
                left={`${hub.away.name} commit ${collision.awayCommitted.toFixed(1)}/90`}
                right={`${hub.home.name} draw ${collision.homeDrawn.toFixed(1)}/90`}
              />
            ) : null}
            <p className="text-xs text-[var(--muted)]">
              Season rates from squad discipline (fouls committed vs fouls drawn).
            </p>
          </div>
        ) : (
          <EmptyReason
            className="mt-3"
            detail={foulCollisionDetail(hub.home.name, hub.away.name, collision)}
            source="player_season_stats"
          />
        )}
      </div>
    </section>
  );
}

function foulCollisionDetail(
  home: string,
  away: string,
  collision: MatchHubPage["foulCollision"],
): string {
  const missing: string[] = [];
  if (collision.homeCommitted == null) missing.push(`${home} fouls committed`);
  if (collision.awayDrawn == null) missing.push(`${away} fouls drawn`);
  if (collision.awayCommitted == null) missing.push(`${away} fouls committed`);
  if (collision.homeDrawn == null) missing.push(`${home} fouls drawn`);
  if (missing.length === 0) {
    return "Team foul rates are not stored for both sides";
  }
  return `Foul collision needs both sides' season rates — missing ${missing.join(", ")}`;
}

function CollisionLine({ left, right }: { left: string; right: string }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
      <p className="font-semibold text-blue-900">Direct Matchup Clash</p>
      <p className="mt-1 text-[#334155]">
        {left} <span className="text-[var(--muted)]">vs</span> {right}
      </p>
    </div>
  );
}
