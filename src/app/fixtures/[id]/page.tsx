import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/seo/entities";
import { DataFreshness } from "@/components/ui/DataFreshness";

import { loadMatchHubPage } from "./hub-load";
import MatchHubView from "./hub-view";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const fixtureId = Number(id);
  if (!Number.isInteger(fixtureId)) return { title: "Match Hub · EdgeBall" };
  try {
    const hub = await loadMatchHubPage(fixtureId);
    const title = `${hub.home.name} vs ${hub.away.name} — stats, H2H & odds · ${hub.competition}`;
    const description = `${hub.home.name} vs ${hub.away.name} (${hub.competition}, ${hub.kickoff}): team stats, head-to-head, referee and card context, lineups and stored bookmaker prices with model probabilities.`;
    return {
      title,
      description,
      alternates: { canonical: `/fixtures/${fixtureId}` },
      openGraph: { title, description, type: "website" },
    };
  } catch {
    return { title: "Match Hub · EdgeBall" };
  }
}

export default async function FixtureMatchHubPage({ params, searchParams }: PageProps) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const fixtureId = Number(id);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) notFound();
  const hub = await loadMatchHubPage(fixtureId);

  const finished = hub.status != null && ["FT", "AET", "PEN"].includes(hub.status);
  const status =
    finished
      ? "https://schema.org/EventCompleted"
      : hub.status === "PST"
        ? "https://schema.org/EventPostponed"
        : hub.status === "CANC"
          ? "https://schema.org/EventCancelled"
          : "https://schema.org/EventScheduled";
  const eventLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${hub.home.name} vs ${hub.away.name}`,
    sport: "Football",
    url: `${SITE_URL}/fixtures/${hub.id}`,
    eventStatus: status,
    ...(hub.kickoffAt ? { startDate: hub.kickoffAt } : {}),
    ...(hub.venue ? { location: { "@type": "Place", name: hub.venue } } : {}),
    homeTeam: { "@type": "SportsTeam", name: hub.home.name, ...(hub.home.logo ? { logo: hub.home.logo } : {}) },
    awayTeam: { "@type": "SportsTeam", name: hub.away.name, ...(hub.away.logo ? { logo: hub.away.logo } : {}) },
    superEvent: { "@type": "SportsEvent", name: hub.competition },
  };
  const crumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Fixtures", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: hub.competition,
        item: `${SITE_URL}/competitions/${hub.leagueId}`,
      },
      { "@type": "ListItem", position: 3, name: `${hub.home.name} vs ${hub.away.name}` },
    ],
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd data={[eventLd, crumbsLd]} />
      <div className="mb-4">
        <DataFreshness jobs={["odds", "lineups", "results"]} />
      </div>
      <MatchHubView hub={hub} initialTab={tab} />
    </main>
  );
}
