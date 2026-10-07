import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";

import type { FixtureMatch } from "./types";

export const FIXTURE_DATE_OFFSETS = [-1, 0, 1, 2, 3, 4, 5, 6] as const;

const LEAGUE_PRIORITY = new Map<number, number>(
  TARGET_LEAGUE_IDS.map((id, index) => [id, index]),
);
const BUCKET_ORDER: Record<FixtureMatch["bucket"], number> = {
  live: 0,
  upcoming: 1,
  other: 2,
  finished: 3,
};

export function fixtureDateOptions(today: string) {
  return FIXTURE_DATE_OFFSETS.map((offset) => shiftDate(today, offset));
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function fixtureDateLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === shiftDate(today, 1)) return "Tomorrow";
  if (date === shiftDate(today, -1)) return "Yesterday";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function hasFixtureOdds(match: FixtureMatch) {
  return Object.values(match.prices).some(
    (odd) => odd != null && Number.isFinite(odd) && odd > 1,
  );
}

/** Live matches first, then upcoming by kickoff; finished games stay chronological. */
export function sortFixtureMatches(matches: FixtureMatch[]) {
  return [...matches].sort((left, right) => {
    const bucket = BUCKET_ORDER[left.bucket] - BUCKET_ORDER[right.bucket];
    if (bucket !== 0) return bucket;
    return kickoffSortValue(left) - kickoffSortValue(right);
  });
}

export function groupFixturesByLeague(matches: FixtureMatch[]) {
  const groups = new Map<number, { id: number; name: string; logo: string | null; matches: FixtureMatch[] }>();
  for (const match of matches) {
    const existing = groups.get(match.leagueId);
    if (existing) existing.matches.push(match);
    else groups.set(match.leagueId, {
      id: match.leagueId,
      name: match.league,
      logo: match.leagueLogo,
      matches: [match],
    });
  }
  return [...groups.values()].sort((left, right) => {
    const priority = leaguePriority(left.id) - leaguePriority(right.id);
    return priority !== 0 ? priority : left.name.localeCompare(right.name);
  });
}

function leaguePriority(leagueId: number) {
  return LEAGUE_PRIORITY.get(leagueId) ?? Number.MAX_SAFE_INTEGER;
}

function kickoffSortValue(match: FixtureMatch) {
  const parsed = match.kickoffAt == null ? Number.NaN : Date.parse(match.kickoffAt);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
