import Link from "next/link";
import { cache, Suspense } from "react";

import { TeamBadge } from "@/components/assets";
import { FollowButton } from "@/components/watchlist/FollowButton";

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
import { loadFixtureEvents, type FixtureEvent } from "./hub-events";
import type { MatchHubPage } from "./hub-load";
import { MatchOddsPills } from "./match-odds-pills";

export default async function MatchHubView({
  hub,
  initialTab,
}: {
  hub: MatchHubPage;
  initialTab?: string;
}) {
  const access = await getSubscriptionAccess();

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
                <Suspense fallback={<PanelSkeleton />}>
                  <StatsPanel hub={hub} view="glance" />
                </Suspense>
                <ContextStrip hub={hub} />
                <Suspense fallback={<PanelSkeleton />}>
                  <AvailabilityLoader hub={hub} />
                </Suspense>
                <DisciplineGauge hub={hub} />
              </>
            ),
          },
          {
            id: "stats",
            label: "Team stats",
            content: (
              <Suspense fallback={<PanelSkeleton />}>
                <StatsPanel hub={hub} view="stats" />
              </Suspense>
            ),
          },
          {
            id: "lineups",
            label: "Lineups",
            content: (
              <Suspense fallback={<PanelSkeleton />}>
                <LineupsLoader hub={hub} />
              </Suspense>
            ),
          },
          ...(matchStarted(hub.status)
            ? [
                {
                  id: "timeline",
                  label: "Timeline",
                  content: (
                    <Suspense fallback={<PanelSkeleton />}>
                      <TimelineLoader hub={hub} />
                    </Suspense>
                  ),
                },
              ]
            : []),
          {
            id: "h2h",
            label: "H2H",
            content: (
              <Suspense fallback={<PanelSkeleton />}>
                <StatsPanel hub={hub} view="h2h" />
              </Suspense>
            ),
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
        <div className="mt-3 flex justify-center">
          <FollowButton
            kind="fixture"
            entityId={hub.id}
            label={`${hub.home.name} vs ${hub.away.name}`}
            href={`/fixtures/${hub.id}`}
          />
        </div>
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

const statsFor = cache((hub: MatchHubPage) =>
  loadMatchStats({ leagueId: hub.leagueId, season: hub.season, home: hub.home, away: hub.away }).catch(
    (cause: unknown) => {
      console.error(`[match-stats] fixture ${hub.id}:`, cause);
      return null;
    },
  ),
);

function PanelSkeleton() {
  return <div className="h-48 animate-pulse rounded-2xl border border-line bg-white/70" aria-busy="true" />;
}

async function StatsPanel({ hub, view }: { hub: MatchHubPage; view: "glance" | "stats" | "h2h" }) {
  const stats = await statsFor(hub);
  if (!stats) {
    return (
      <EmptyReason
        variant="panel"
        detail="Team stats could not be loaded for this fixture"
        source="fixtures / fixture_statistics"
      />
    );
  }
  if (view === "glance") {
    return <MatchGlance home={stats.home} away={stats.away} competition={hub.competition} />;
  }
  if (view === "h2h") return <HeadToHeadPanel h2h={stats.h2h} home={hub.home} away={hub.away} />;
  return (
    <>
      <TeamStatsComparison home={stats.home} away={stats.away} competition={hub.competition} />
      <StreaksPanel home={stats.home} away={stats.away} competition={hub.competition} />
    </>
  );
}

async function AvailabilityLoader({ hub }: { hub: MatchHubPage }) {
  const availability = await loadFixtureAvailability(hub.home.id, hub.away.id, hub.kickoffAt).catch(
    (cause: unknown) => {
      console.error(`[availability] fixture ${hub.id}:`, cause);
      return null;
    },
  );
  return <AvailabilityPanel hub={hub} availability={availability} />;
}

async function LineupsLoader({ hub }: { hub: MatchHubPage }) {
  const lineups = await loadFixtureLineups(hub.id).catch((cause: unknown) => {
    console.error(`[lineups] fixture ${hub.id}:`, cause);
    return [] as TeamLineup[];
  });
  return <LineupsPanel hub={hub} lineups={lineups} />;
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

const NOT_STARTED = new Set(["NS", "TBD", "PST", "CANC", "ABD", "AWD", "WO"]);

function matchStarted(status: string | null) {
  return status != null && !NOT_STARTED.has(status);
}

async function TimelineLoader({ hub }: { hub: MatchHubPage }) {
  const events = await loadFixtureEvents(hub.id).catch((cause: unknown) => {
    console.error(`[timeline] fixture ${hub.id}:`, cause);
    return [] as FixtureEvent[];
  });
  return <TimelinePanel hub={hub} events={events} />;
}

function TimelinePanel({ hub, events }: { hub: MatchHubPage; events: FixtureEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyReason
        variant="panel"
        title="No match events stored yet"
        detail="Goals, cards and substitutions appear here once the results sync has covered this fixture"
        source="fixture_events"
      />
    );
  }
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <ol className="space-y-3">
        {events.map((event) => {
          const home = event.teamId === hub.home.id;
          return (
            <li key={event.id} className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
              {home ? <TimelineEntry event={event} align="right" /> : <span />}
              <span className="mt-0.5 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-black tabular-nums text-ink">
                {event.minute}
              </span>
              {!home ? <TimelineEntry event={event} align="left" /> : <span />}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex justify-between border-t border-[var(--line)] pt-3 text-xs font-semibold text-[var(--muted)]">
        <span>{hub.home.name}</span>
        <span>{hub.away.name}</span>
      </div>
    </section>
  );
}

function TimelineEntry({ event, align }: { event: FixtureEvent; align: "left" | "right" }) {
  const label = eventLabel(event);
  const sub = eventSubtitle(event);
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p
        className={`flex items-center gap-2 text-sm font-semibold text-slate-900 ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
      >
        <EventMarker event={event} />
        <span className="min-w-0 truncate">{event.playerName ?? label}</span>
      </p>
      <p className={`mt-0.5 text-xs text-[var(--muted)] ${align === "right" ? "pr-4.5" : "pl-4.5"}`}>
        {event.playerName ? label : ""}
        {sub ? (event.playerName ? ` · ${sub}` : sub) : ""}
      </p>
    </div>
  );
}

function eventLabel(event: FixtureEvent) {
  if (event.type === "Goal") return event.detail || "Goal";
  if (event.type === "Card") return event.detail || "Card";
  if (event.type.toLowerCase() === "subst") return "Substitution";
  if (event.type.toLowerCase() === "var") return event.detail || "VAR check";
  return event.detail || event.type;
}

function eventSubtitle(event: FixtureEvent) {
  if (event.type.toLowerCase() === "subst" && event.assistName) {
    return `on for ${event.assistName}`;
  }
  if (event.type === "Goal" && event.assistName && event.detail !== "Missed Penalty") {
    return `assist ${event.assistName}`;
  }
  return null;
}

function EventMarker({ event }: { event: FixtureEvent }) {
  const type = event.type.toLowerCase();
  const detail = event.detail.toLowerCase();
  if (type === "goal") {
    const missed = detail.includes("missed");
    return (
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
          missed ? "border-2 border-red-400 bg-white" : "bg-cobalt"
        }`}
      />
    );
  }
  if (type === "card") {
    const red = detail.includes("red") || detail.includes("second yellow");
    return (
      <span
        className={`inline-block h-3 w-2 shrink-0 rounded-[2px] ${red ? "bg-red-500" : "bg-amber-400"}`}
      />
    );
  }
  if (type === "subst") {
    return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-300 bg-white" />;
  }
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-300" />;
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
