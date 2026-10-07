export type MatchLogRow = {
  fixtureId: number;
  kickoff: string;
  opponent: string;
  /** Home / away from the player's team perspective. */
  venue: "H" | "A" | null;
  /** Final score as "2-1" when stored. */
  score: string | null;
  referee: string | null;
  minutes: number | null;
  shots: number | null;
  shotsOn: number | null;
  foulsCommitted: number | null;
  foulsWon: number | null;
  tackles: number | null;
  gkSaves: number | null;
  yellow: number | null;
  red: number | null;
};
