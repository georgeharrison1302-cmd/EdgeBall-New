export type FixtureSide = {
  id: number | null;
  name: string;
  logo: string | null;
  form: string | null;
};

export type FixtureMatch = {
  id: number;
  leagueId: number;
  season: number;
  league: string;
  leagueLogo: string | null;
  kickoff: string;
  /** Absolute kickoff instant (ISO) for time-aware Upcoming/Live/Finished tabs. */
  kickoffAt: string | null;
  status: string;
  bucket: "upcoming" | "finished" | "live" | "other";
  home: FixtureSide;
  away: FixtureSide;
  goalsHome: number | null;
  goalsAway: number | null;
  minute: number | null;
  homePct: number | null;
  drawPct: number | null;
  awayPct: number | null;
  underOver: string | null;
  goalsLine: { home: string; away: string } | null;
  homeOdd: number | null;
  drawOdd: number | null;
  awayOdd: number | null;
  lock: { referee: string; cards: number; player: string; fouls: number } | null;
  homeYellowsPerGame: number | null;
  awayYellowsPerGame: number | null;
  strictRef: { name: string; avg: number; vsLeaguePct: number | null } | null;
  gameScript: { label: string; detail: string } | null;
};

export type DayLoad = {
  date: string;
  matches: FixtureMatch[];
};
