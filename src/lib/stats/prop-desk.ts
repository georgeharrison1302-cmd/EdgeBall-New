import type { MatchLogRow } from "@/app/competitions/match-types";

export type DeskStat =
  | "sot"
  | "shots"
  | "tackles"
  | "drawn"
  | "fouls"
  | "saves"
  | "cards";

export type DeskSplit = "L5" | "L10" | "L20" | "Season" | "H2H";

/** Sportsbook half-lines: over X.5 → integer threshold ceil(X.5). */
export type DeskHalfLine = 0.5 | 1.5 | 2.5 | 3.5 | 4.5;

export type BookQuote = {
  bookmaker: string;
  decimalOdds: number | null;
};

export type DeskGameLog = MatchLogRow & {
  /** True when this appearance is vs the upcoming opponent. */
  vsUpcomingOpponent?: boolean;
};

export type DeskLineupStatus =
  | { kind: "starter"; position: string }
  | { kind: "alert"; detail: string }
  | null;

export type DeskPlayerRow = {
  id: string;
  player: string;
  position: string | null;
  initials: string;
  match: string;
  kickoffLabel: string;
  competition: string;
  matchupRank: string | null;
  lineup: DeskLineupStatus;
  tacticalNote: string | null;
  /** Default chip when the row mounts. */
  defaultStat: DeskStat;
  seasonApps: number | null;
  /** Season averages keyed by micro-stat. */
  seasonAvgByStat: Partial<Record<DeskStat, number | null>>;
  /** Model probs keyed by micro-stat (when stored). */
  modelProbByStat: Partial<Record<DeskStat, number | null>>;
  /**
   * Odds keyed by micro-stat → integer threshold (1/2/3/4/5).
   * Missing books stay null — never invent prices.
   */
  oddsByStatLine: Partial<
    Record<DeskStat, Partial<Record<number, BookQuote[]>>>
  >;
  logs: DeskGameLog[];
};

export type DeskFormMetrics = {
  counts: number[];
  hits: number;
  hitPct: number | null;
  total: number | null;
  avg: number | null;
};

/** URL `stat=` keys ↔ Player Props markets. */
export const DESK_STAT_MARKETS: Array<{
  id: DeskStat;
  label: string;
  market:
    | "Shots on Target"
    | "Total Shots"
    | "To Be Carded"
    | "Fouls Committed"
    | "Fouls Drawn"
    | "Tackles"
    | "GK Saves";
}> = [
  { id: "fouls", label: "Fouls", market: "Fouls Committed" },
  { id: "sot", label: "Shots On Target", market: "Shots on Target" },
  { id: "shots", label: "Shots", market: "Total Shots" },
  { id: "cards", label: "Yellow Cards", market: "To Be Carded" },
  { id: "tackles", label: "Tackles", market: "Tackles" },
  { id: "drawn", label: "Fouls Drawn", market: "Fouls Drawn" },
  { id: "saves", label: "GK Saves", market: "GK Saves" },
];

export const DESK_STAT_CHIPS: Array<{ id: DeskStat; label: string }> = DESK_STAT_MARKETS.map(
  (row) => ({ id: row.id, label: row.label }),
);

export function deskStatToMarket(stat: DeskStat) {
  return DESK_STAT_MARKETS.find((row) => row.id === stat)?.market ?? null;
}

export function marketToDeskStat(market: string): DeskStat | null {
  return DESK_STAT_MARKETS.find((row) => row.market === market)?.id ?? null;
}

export function parseDeskStatParam(value: string | null | undefined): DeskStat {
  const hit = DESK_STAT_MARKETS.find((row) => row.id === value);
  return hit?.id ?? "fouls";
}

export function linesForStat(stat: DeskStat): DeskHalfLine[] {
  if (stat === "sot" || stat === "shots" || stat === "cards") return [0.5, 1.5];
  if (stat === "saves") return [2.5, 3.5, 4.5];
  return [1.5, 2.5, 3.5];
}

/** Integer clear lines shown in the At Least stepper. */
export function thresholdsForStat(stat: DeskStat): number[] {
  if (stat === "cards") return [1];
  if (stat === "saves") return [3, 4, 5];
  if (stat === "sot") return [1, 2];
  return [1, 2, 3];
}

export function defaultThresholdForStat(stat: DeskStat): number {
  if (stat === "cards" || stat === "sot") return 1;
  if (stat === "saves") return 3;
  return 2;
}

export function defaultLineForStat(stat: DeskStat): DeskHalfLine {
  const lines = linesForStat(stat);
  return lines[0] ?? 0.5;
}

/** over 0.5 → ≥1, over 1.5 → ≥2, … */
export function halfLineToThreshold(line: DeskHalfLine): number {
  return Math.ceil(line);
}

export function countForStat(row: DeskGameLog | MatchLogRow, stat: DeskStat): number | null {
  if (stat === "fouls") return row.foulsCommitted;
  if (stat === "drawn") return row.foulsWon;
  if (stat === "sot") return row.shotsOn;
  if (stat === "shots") return row.shots;
  if (stat === "tackles") return row.tackles;
  if (stat === "saves") return row.gkSaves;
  if (stat === "cards") {
    if (row.yellow == null && row.red == null) return null;
    return (row.yellow ?? 0) + (row.red ?? 0);
  }
  return null;
}

/**
 * Empirical last-N form vs a clear line. Oldest→newest counts; never pads misses.
 * Empty breakdown → null metrics (honest empty).
 */
export function deskForm(
  breakdown: MatchLogRow[] | undefined | null,
  threshold: number,
  stat: DeskStat,
): DeskFormMetrics {
  const counts: number[] = [];
  let hits = 0;
  let total = 0;
  for (const row of breakdown ?? []) {
    const value = countForStat(row, stat);
    if (value == null) continue;
    counts.push(value);
    total += value;
    if (value >= threshold) hits += 1;
  }
  const n = counts.length;
  return {
    counts,
    hits,
    hitPct: n === 0 ? null : Math.round((hits / n) * 100),
    total: n === 0 ? null : total,
    avg: n === 0 ? null : total / n,
  };
}

export function statBreakdownLabel(row: DeskGameLog, stat: DeskStat): string {
  if (stat === "sot") {
    const sot = row.shotsOn;
    const shots = row.shots;
    if (sot == null) return "SOT not stored";
    if (shots == null) return `${sot} SOT`;
    return `${sot} SOT out of ${shots} shots`;
  }
  if (stat === "shots") {
    return row.shots == null ? "Shots not stored" : `${row.shots} shots`;
  }
  if (stat === "fouls") {
    return row.foulsCommitted == null
      ? "Fouls committed not stored"
      : `${row.foulsCommitted} fouls committed`;
  }
  if (stat === "drawn") {
    return row.foulsWon == null ? "Fouls won not stored" : `${row.foulsWon} fouls won`;
  }
  if (stat === "tackles") {
    return row.tackles == null ? "Tackles not stored" : `${row.tackles} tackles`;
  }
  if (stat === "saves") {
    return row.gkSaves == null ? "Saves not stored" : `${row.gkSaves} saves`;
  }
  const yellow = row.yellow ?? 0;
  const red = row.red ?? 0;
  if (row.yellow == null && row.red == null) return "Cards not stored";
  return `${yellow} yellow · ${red} red`;
}

export function sliceLogs(logs: DeskGameLog[], split: DeskSplit): DeskGameLog[] {
  if (split === "Season") return [];
  if (split === "H2H") return logs.filter((row) => row.vsUpcomingOpponent);
  const n = split === "L5" ? 5 : split === "L10" ? 10 : 20;
  return logs.slice(0, n);
}

export function deskFormMetrics(
  logs: DeskGameLog[],
  stat: DeskStat,
  threshold: number,
  split: DeskSplit,
  seasonAvg: number | null,
) {
  if (split === "Season") {
    const avg = seasonAvg != null && Number.isFinite(seasonAvg) ? seasonAvg : null;
    return {
      counts: [] as number[],
      games: [] as DeskGameLog[],
      hitPct: null as number | null,
      total: null as number | null,
      avg,
      empirical: false,
    };
  }

  const games = sliceLogs(logs, split);
  const counts: number[] = [];
  let hits = 0;
  let total = 0;
  for (const game of games) {
    const value = countForStat(game, stat);
    if (value == null) continue;
    counts.push(value);
    total += value;
    if (value >= threshold) hits += 1;
  }
  const n = counts.length;
  return {
    counts,
    games: games.filter((g) => countForStat(g, stat) != null),
    hitPct: n === 0 ? null : Math.round((hits / n) * 100),
    total: n === 0 ? null : total,
    avg: n === 0 ? null : total / n,
    empirical: true,
  };
}

export function edgePct(
  modelProb: number | null | undefined,
  decimalOdds: number | null | undefined,
) {
  if (modelProb == null || decimalOdds == null) return null;
  if (!Number.isFinite(modelProb) || !Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return null;
  }
  return (decimalOdds * modelProb - 1) * 100;
}

export function bestBookOdds(quotes: BookQuote[] | undefined): number | null {
  if (!quotes || quotes.length === 0) return null;
  const priced = quotes
    .map((q) => q.decimalOdds)
    .filter((odd): odd is number => odd != null && Number.isFinite(odd) && odd > 1);
  if (priced.length === 0) return null;
  return Math.max(...priced);
}

export function statLabel(stat: DeskStat): string {
  return DESK_STAT_MARKETS.find((row) => row.id === stat)?.label ?? "Stat";
}

/** "2+ Fouls Committed" → integer clear line. */
export function selectionClearLine(selection: string): number | null {
  const match = selection.match(/(\d+)\+/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
