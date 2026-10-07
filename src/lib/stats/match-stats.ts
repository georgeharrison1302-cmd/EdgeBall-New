import {
  currentStreaks,
  resultOf,
  selectMatches,
  summarizeTeam,
  type Result,
  type TeamMatch,
  type TeamStatSummary,
  type TeamStreaks,
  type Venue,
} from "./team-engine";

/** "venue" = home side's home games, away side's away games. */
export type SplitKey = "all" | "venue" | "last5" | "last10";
export const SPLIT_KEYS: SplitKey[] = ["all", "venue", "last5", "last10"];

export type TeamRef = { id: number; name: string; logo: string | null };

export type RecentMatch = {
  fixtureId: number;
  date: string;
  venue: Venue;
  opponent: TeamRef;
  goalsFor: number;
  goalsAgainst: number;
  result: Result;
};

export type TeamPanel = {
  team: TeamRef;
  venue: Venue;
  splits: Record<SplitKey, TeamStatSummary>;
  streaks: TeamStreaks;
  /** Newest first. */
  recent: RecentMatch[];
};

export type HeadToHead = {
  /** From the home team's perspective, newest first. */
  meetings: RecentMatch[];
  summary: TeamStatSummary;
};

export type MatchStatsView = {
  leagueId: number;
  season: number;
  home: TeamPanel;
  away: TeamPanel;
  h2h: HeadToHead;
};

const RECENT = 5;

/** `matches` must be newest first (as returned by `buildTeamMatches`). */
export function buildTeamPanel(
  matches: TeamMatch[],
  team: TeamRef,
  venue: Venue,
  names: Map<number, TeamRef>,
): TeamPanel {
  const all = selectMatches(matches, team.id);
  return {
    team,
    venue,
    splits: {
      all: summarizeTeam(all),
      venue: summarizeTeam(selectMatches(matches, team.id, { venue })),
      last5: summarizeTeam(all.slice(0, 5)),
      last10: summarizeTeam(all.slice(0, 10)),
    },
    streaks: currentStreaks(all),
    recent: all.slice(0, RECENT).map((match) => toRecent(match, names)),
  };
}

export function buildHeadToHead(
  matches: TeamMatch[],
  homeId: number,
  names: Map<number, TeamRef>,
  limit = 10,
): HeadToHead {
  const meetings = selectMatches(matches, homeId, { last: limit });
  return { meetings: meetings.map((match) => toRecent(match, names)), summary: summarizeTeam(meetings) };
}

export function opponentIds(...lists: TeamMatch[][]) {
  return [...new Set(lists.flat().map((match) => match.opponentId))];
}

function toRecent(match: TeamMatch, names: Map<number, TeamRef>): RecentMatch {
  return {
    fixtureId: match.fixtureId,
    date: match.date,
    venue: match.venue,
    opponent: names.get(match.opponentId) ?? { id: match.opponentId, name: "Unknown team", logo: null },
    goalsFor: match.goalsFor,
    goalsAgainst: match.goalsAgainst,
    result: resultOf(match),
  };
}
