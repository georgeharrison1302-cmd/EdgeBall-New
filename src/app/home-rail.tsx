"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { KickoffText } from "@/components/display/KickoffText";
import { OddsText } from "@/components/display/OddsText";
import { EmptyReason } from "@/components/stats/EmptyReason";

import type { BuilderLeg, FeaturedMatch, HomePicks, PlayerLeg } from "./home-picks";

type Conviction = {
  competition: string;
  kickoff: string | null;
  referee: string;
  cards: number;
  home: { name: string; logo: string | null };
  away: { name: string; logo: string | null };
  player: { name: string; photo: string | null; team: string; fouls: number; matches: number };
};

export default function HomeDashboard({ picks, conviction }: { picks: HomePicks; conviction: Conviction | null }) {
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const match = picks.featured[index] ?? null;
  const count = picks.featured.length;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-blue-600">Countdown bet builder</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setIndex((value) => (value - 1 + count) % Math.max(count, 1))} className="rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-blue-600">Prev</button>
            <button type="button" onClick={() => setIndex((value) => (value + 1) % Math.max(count, 1))} className="rounded-full bg-blue-600 px-3 py-1 text-sm font-semibold text-white">Next</button>
          </div>
        </div>
        {match ? (
          <div className="mt-5 grid items-center gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">{match.competition}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Side name={match.home.name} logo={match.home.logo} />
                <p className="text-sm font-semibold text-slate-900">v</p>
                <Side name={match.away.name} logo={match.away.logo} align="right" />
              </div>
              <p className="mt-4 text-sm text-gray-500">
                <KickoffText utc={match.kickoffAt} fallback={match.when} />
              </p>
              <Countdown kickoff={match.kickoffAt} />
            </div>
            <Slip title="3-leg builder" legs={match.builder} actionLabel={combinedLabel(match.builder)} />
          </div>
        ) : (
          <EmptyReason
            className="mt-4"
            detail="No upcoming fixture has a stored Bet365 price above 1.35"
            source="prematch_odds"
          />
        )}
        {count > 1 ? (
          <div className="mt-4 flex justify-center gap-1">
            {picks.featured.map((item, dot) => (
              <button key={item.id} type="button" aria-label={`Show ${item.home.name} v ${item.away.name}`} onClick={() => setIndex(dot)} className={`h-1.5 rounded-full ${dot === index ? "w-6 bg-blue-600" : "w-1.5 bg-gray-200"}`} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-blue-600">Cross-match player acca</h2>
          <p className="mt-1 text-sm text-gray-500">One stored player price from four different matches.</p>
          <PlayerSlip legs={picks.crossBuilder} />
          <button type="button" onClick={() => setAdded(true)} disabled={picks.crossBuilder.length === 0 || added} className="mt-4 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200 disabled:text-gray-500">
            {added ? "Added" : "+ Add to betslip"}
          </button>
        </section>
        <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-blue-600">Data treble</h2>
          <p className="mt-1 text-sm text-gray-500">Three stored goals or both-teams lines that cleared the recent hit rate.</p>
          <ul className="mt-4 divide-y divide-gray-100">
            {picks.treble.length === 0 ? (
              <li className="py-3">
                <EmptyReason
                  detail="No goals / BTTS treble clears the recent hit-rate with a stored price"
                  source="prematch_odds"
                />
              </li>
            ) : null}
            {picks.treble.map((leg) => (
              <li key={leg.label} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{leg.label}</span>
                  <span className="text-xs text-gray-500">{leg.hits}/{leg.sample}</span>
                </span>
                <span className="text-sm font-semibold text-blue-600">{leg.price}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-auto rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">{combinedLabel(picks.treble)}</button>
        </section>
        <ConvictionCard conviction={conviction} />
      </section>

      <ProjectionCard match={match} />
    </div>
  );
}

function Slip({ title, legs, actionLabel }: { title: string; legs: BuilderLeg[]; actionLabel: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">{title}</p>
      <ul className="mt-3 divide-y divide-gray-100">
        {legs.length === 0 ? (
          <li className="py-3">
            <EmptyReason detail="No stored leg is priced above 1.35" source="prematch_odds" />
          </li>
        ) : null}
        {legs.map((leg) => (
          <li key={leg.label} className="flex items-center justify-between gap-3 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-900">{leg.label}</span>
              <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">{leg.hits}/{leg.sample}</span>
            </span>
            <span className="text-sm font-semibold text-slate-900">{leg.price}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-3 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">{actionLabel}</button>
      <p className="mt-2 text-xs text-gray-500">Combined figure is the product of the stored prices.</p>
    </div>
  );
}

function PlayerSlip({ legs }: { legs: PlayerLeg[] }) {
  return (
    <ul className="mt-4 divide-y divide-gray-100">
      {legs.length === 0 ? (
        <li className="py-3">
          <EmptyReason
            detail="No player price matches a stored season stat"
            source="prematch_odds / player_season_stats"
          />
        </li>
      ) : null}
      {legs.map((leg) => (
        <li key={leg.id} className="flex items-center justify-between gap-3 py-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-900">{leg.name}</span>
            <span className="block truncate text-xs text-gray-500">{leg.note}</span>
            <span className="block truncate text-xs text-gray-500">{leg.match}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-blue-600">{leg.price}</span>
        </li>
      ))}
    </ul>
  );
}

function ConvictionCard({ conviction }: { conviction: Conviction | null }) {
  if (!conviction) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-blue-600">High-conviction matchup</h2>
        <EmptyReason
          className="mt-4"
          detail="No player clears 1.80 fouls against a referee averaging 5.50 yellows in the next 48 hours"
          source="player_season_stats / fixture_statistics"
        />
      </section>
    );
  }
  return (
    <section className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-blue-600">High-conviction matchup</h2>
      <p className="mt-1 text-sm text-gray-500">
        {conviction.competition} · <KickoffText utc={conviction.kickoff} />
      </p>
      <p className="mt-3 text-sm font-semibold text-slate-900">{conviction.home.name} v {conviction.away.name}</p>
      <div className="mt-4 flex items-center gap-3">
        {conviction.player.photo ? <img src={conviction.player.photo} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="h-12 w-12 rounded-full bg-blue-50" />}
        <div>
          <p className="font-semibold text-slate-900">{conviction.player.name}</p>
          <p className="text-xs text-gray-500">{conviction.player.team}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">Fouls committed</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{conviction.player.fouls.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{conviction.player.matches} matches</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] tracking-wide text-gray-500 uppercase">Referee yellows</p>
          <p className="mt-1 text-lg font-semibold text-blue-600">{conviction.cards.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{conviction.referee}</p>
        </div>
      </div>
    </section>
  );
}

function ProjectionCard({ match }: { match: FeaturedMatch | null }) {
  const projection = match?.projection;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-blue-600">Match projection</h2>
      {match && projection && projection.home != null && projection.draw != null && projection.away != null ? (
        <>
          <p className="mt-1 text-sm text-gray-500">{match.home.name} v {match.away.name} · stored API-Football model</p>
          <div className="mt-4 flex h-8 overflow-hidden rounded-full text-[11px] font-semibold text-white">
            <span className="flex items-center justify-center bg-blue-800" style={{ width: `${projection.home}%` }}>{projection.home}%</span>
            <span className="flex items-center justify-center bg-gray-400" style={{ width: `${projection.draw}%` }}>{projection.draw}%</span>
            <span className="flex items-center justify-center bg-blue-300 text-slate-900" style={{ width: `${projection.away}%` }}>{projection.away}%</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <OddButton label={match.home.name} odd={projection.homeOdd} />
            <OddButton label="Draw" odd={projection.drawOdd} />
            <OddButton label={match.away.name} odd={projection.awayOdd} />
          </div>
        </>
      ) : (
        <EmptyReason
          className="mt-4"
          detail={
            match
              ? "No stored win model for this match"
              : "No featured match to project — no upcoming fixture with a stored Bet365 price"
          }
          source={match ? "predictions" : "prematch_odds"}
        />
      )}
    </section>
  );
}

function OddButton({ label, odd }: { label: string; odd: string | null }) {
  const decimal = odd == null ? null : Number(odd);
  return (
    <button type="button" className="rounded-xl border border-gray-200 px-3 py-3 text-center">
      <span className="block truncate text-[10px] font-semibold tracking-wide text-gray-500 uppercase">{label}</span>
      <span className="mt-1 block text-sm font-semibold text-blue-600">
        {decimal != null && Number.isFinite(decimal) ? (
          <OddsText decimal={decimal} prefix="" />
        ) : (
          "No Book Odds"
        )}
      </span>
    </button>
  );
}

function Side({ name, logo, align = "left" }: { name: string; logo: string | null; align?: "left" | "right" }) {
  const end = align === "right";
  return (
    <span className={`flex min-w-0 items-center gap-2 ${end ? "flex-row-reverse text-right" : ""}`}>
      {logo ? <img src={logo} alt="" className="h-10 w-10 object-contain" /> : <span className="h-10 w-10 rounded-full bg-blue-50" />}
      <span className="truncate text-lg font-semibold text-slate-900">{name}</span>
    </span>
  );
}

function Countdown({ kickoff }: { kickoff: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!kickoff) {
    return (
      <EmptyReason className="mt-2" detail="Kickoff time is not stored" source="fixtures" />
    );
  }
  const diff = new Date(kickoff).getTime() - now;
  if (!Number.isFinite(diff)) {
    return (
      <EmptyReason className="mt-2" detail="Kickoff time is not stored" source="fixtures" />
    );
  }
  if (diff <= 0) return <p className="mt-3 text-2xl font-semibold text-blue-600">Kickoff passed</p>;
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const text = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  return <p className="mt-3 text-3xl font-semibold tracking-tight text-blue-600">{text} <span className="text-base">until kickoff</span></p>;
}

function combinedLabel(legs: BuilderLeg[]) {
  const prices = legs.flatMap((leg) => {
    const price = Number(leg.price);
    return Number.isFinite(price) && price > 1 ? [price] : [];
  });
  if (prices.length < 2) return "Combined price unavailable";
  const product = prices.reduce((total, price) => total * price, 1);
  return `Combined ${product.toFixed(2)}`;
}
