import type { MatchMarketPrices } from "@/lib/odds/match-markets";

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
  prices: MatchMarketPrices;
};

export type DayLoad = {
  date: string;
  matches: FixtureMatch[];
};
