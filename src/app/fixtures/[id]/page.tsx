import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadMatchHubPage } from "./hub-load";
import MatchHubView from "./hub-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

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

export default async function FixtureMatchHubPage({ params }: PageProps) {
  const { id } = await params;
  const fixtureId = Number(id);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) notFound();
  const hub = await loadMatchHubPage(fixtureId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-extrabold tracking-[0.18em] text-[var(--neon)] uppercase">
          Match Hub
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--ink)]">
          {hub.home.name} vs {hub.away.name}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Match markets, player props in market accordions, and season proof next to every
          priced selection.
        </p>
      </div>
      <MatchHubView hub={hub} />
    </main>
  );
}
