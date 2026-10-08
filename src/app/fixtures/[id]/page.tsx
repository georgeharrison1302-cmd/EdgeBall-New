import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
    return { title: `${hub.home.name} vs ${hub.away.name} · Match Hub · EdgeBall` };
  } catch {
    return { title: "Match Hub · EdgeBall" };
  }
}

export default async function FixtureMatchHubPage({ params, searchParams }: PageProps) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const fixtureId = Number(id);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) notFound();
  const hub = await loadMatchHubPage(fixtureId);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <MatchHubView hub={hub} initialTab={tab} />
    </main>
  );
}
