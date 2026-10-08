export const FREE_WATCH_LIMIT = 3;
const KICKOFF_SOON_MS = 60 * 60 * 1000;

export type WatchItem = { kind: "team" | "fixture"; entityId: number; createdAt: string };

export type FixtureState = {
  id: number;
  label: string;
  kickoff: string | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: string | null;
  lineupsConfirmed: boolean;
  tips: { key: string; selection: string; edgePct: number; generatedAt: string }[];
};

export type NewAlert = {
  dedupeKey: string;
  kind: "lineup" | "kickoff" | "tip";
  title: string;
  body: string;
  href: string;
};

const NOT_STARTED = new Set(["NS", "TBD"]);

/** Fixtures a user cares about: followed directly, or involving a followed team. */
export function relevantFixtures(items: WatchItem[], fixtures: FixtureState[]): FixtureState[] {
  const fixtureIds = new Set(items.filter((item) => item.kind === "fixture").map((item) => item.entityId));
  const teamIds = new Set(items.filter((item) => item.kind === "team").map((item) => item.entityId));
  return fixtures.filter(
    (fixture) =>
      fixtureIds.has(fixture.id) ||
      (fixture.homeTeamId != null && teamIds.has(fixture.homeTeamId)) ||
      (fixture.awayTeamId != null && teamIds.has(fixture.awayTeamId)),
  );
}

/** Pure alert rules: lineup confirmed, kickoff within an hour, new model tip. */
export function alertsFor(items: WatchItem[], fixtures: FixtureState[], now = Date.now()): NewAlert[] {
  const since = items.length ? Math.min(...items.map((item) => Date.parse(item.createdAt))) : now;
  const alerts: NewAlert[] = [];

  for (const fixture of relevantFixtures(items, fixtures)) {
    const href = `/fixtures/${fixture.id}`;
    const kickoffMs = fixture.kickoff ? Date.parse(fixture.kickoff) : Number.NaN;
    const upcoming = fixture.status == null || NOT_STARTED.has(fixture.status);

    if (fixture.lineupsConfirmed && upcoming) {
      alerts.push({
        dedupeKey: `lineup:${fixture.id}`,
        kind: "lineup",
        title: `Lineups confirmed: ${fixture.label}`,
        body: "Starting XIs are in — card and prop prices can now be checked against confirmed starters.",
        href: `${href}?tab=lineups`,
      });
    }

    if (upcoming && Number.isFinite(kickoffMs) && kickoffMs > now && kickoffMs - now <= KICKOFF_SOON_MS) {
      alerts.push({
        dedupeKey: `kickoff:${fixture.id}`,
        kind: "kickoff",
        title: `Kicks off within the hour: ${fixture.label}`,
        body: "Final chance to check prices before kickoff.",
        href,
      });
    }

    for (const tip of fixture.tips) {
      if (Date.parse(tip.generatedAt) < since) continue;
      alerts.push({
        dedupeKey: `tip:${tip.key}`,
        kind: "tip",
        title: `New model tip: ${tip.selection}`,
        body: `${fixture.label} — model edge +${tip.edgePct.toFixed(1)}%. Check the Model Record for how tips like this have performed.`,
        href,
      });
    }
  }
  return alerts;
}
