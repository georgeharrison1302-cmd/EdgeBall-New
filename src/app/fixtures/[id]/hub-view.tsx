import Link from "next/link";

import { FactorBadge } from "@/components/factors/FactorBadge";
import { TaleOfTheTape } from "@/components/MatchHub/TaleOfTheTape";
import { TopValueAngles } from "@/components/MatchHub/TopValueAngles";
import { CardMeter } from "@/components/stats/CardMeter";
import { EmptyReason } from "@/components/stats/EmptyReason";
import { GameScriptBadge } from "@/components/stats/GameScriptBadge";
import { MatchupClashBadgeFromClash } from "@/components/stats/MatchupClashBadge";
import { StrictRefBadgeFromProfile } from "@/components/stats/StrictRefBadge";
import { PremiumPaywall } from "@/components/ui/PremiumPaywall";
import { getSubscriptionAccess } from "@/utils/subscription";

import { HubCardBoard } from "./hub-card-board";
import type { MatchHubPage } from "./hub-load";
import { MatchOddsPills } from "./match-odds-pills";

export default async function MatchHubView({ hub }: { hub: MatchHubPage }) {
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

      <PremiumPaywall unlocked={access.unlocked}>
        <TopValueAngles
          rows={hub.propBoard}
          fixtureId={hub.id}
          unlocked={access.unlocked}
        />
      </PremiumPaywall>
      <Hero hub={hub} unlocked={access.unlocked} />
      <ContextStrip hub={hub} />
      <DisciplineGauge hub={hub} />
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
          <TeamBlock team={hub.home} align="left" />
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-wider text-[var(--muted)] uppercase">
              Kick-off
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight tabular-nums text-[var(--ink)]">
              {hub.kickoff}
            </p>
            {hub.status ? <p className="mt-1 text-xs text-[var(--muted)]">{hub.status}</p> : null}
          </div>
          <TeamBlock team={hub.away} align="right" />
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
}: {
  team: MatchHubPage["home"];
  align: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {team.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" className="h-12 w-12 object-contain" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-[var(--ink)]">
          {team.name.slice(0, 1)}
        </span>
      )}
      <p className="min-w-0 truncate text-sm font-bold text-[var(--ink)] sm:text-base">{team.name}</p>
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
