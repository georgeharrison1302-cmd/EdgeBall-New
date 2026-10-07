import { asNumber, asRecord } from "@/utils/pyth";

export type StatCategory =
  | "fouls_committed"
  | "fouls_drawn"
  | "shots_on"
  | "shots_total"
  | "yellow"
  | "goals"
  | "tackles"
  | "gk_saves";

export type FormOutcome = "hit" | "miss";

/** Minimal shape from `fixture_player_statistics` for form extraction. */
export type PlayerMatchLogRow = {
  player_id: number;
  fixture_id: number;
  statistics: unknown;
  /** ISO kickoff when known — used to order newest-last. */
  date?: string | null;
};

/**
 * Last-N hit/miss outcomes for a player × stat × line.
 * Oldest → newest. Only appearances with minutes > 0 count.
 * Returns up to 5 games — partial strips (1–4) are valid; never pads misses.
 *
 * Rows must already be cross-competition (no league filter) — load by player_id
 * only, then attach fixture dates before calling this helper.
 */
export function lastFiveOutcomes(
  playerId: number,
  statCategory: StatCategory,
  targetLine: number,
  rows: PlayerMatchLogRow[],
): FormOutcome[] {
  if (!Number.isFinite(targetLine)) return [];

  const appearances = rows
    .filter((row) => Number(row.player_id) === playerId)
    .map((row) => {
      const stats = primaryStatBlock(row.statistics);
      const minutes = extractMinutes(stats);
      const value = extractStat(stats, statCategory);
      return {
        fixtureId: Number(row.fixture_id),
        date: row.date ? String(row.date) : "",
        minutes,
        value,
      };
    })
    .filter((row) => row.minutes != null && row.minutes > 0 && row.value != null)
    .sort((left, right) => {
      if (left.date && right.date && left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      return left.fixtureId - right.fixtureId;
    });

  const lastFive = appearances.slice(-5);
  return lastFive.map((row) => (row.value! > targetLine ? "hit" : "miss"));
}

/** Map Match Hub / prop market keys onto a form category + default line. */
export function formCategoryForMarket(
  marketKey: string,
  selectionText?: string,
): { category: StatCategory; line: number } {
  const text = `${marketKey} ${selectionText ?? ""}`.toLowerCase();
  const lineFromText = parseLine(selectionText);

  if (marketKey === "cards" || /card|booked/.test(text)) {
    return { category: "yellow", line: lineFromText ?? 0.5 };
  }
  if (marketKey === "sot" || /shot.*target|on target/.test(text)) {
    return { category: "shots_on", line: lineFromText ?? 0.5 };
  }
  if (/total shots|shots(?! on)/.test(text)) {
    return { category: "shots_total", line: lineFromText ?? 0.5 };
  }
  if (marketKey === "fouls" || /foul/.test(text)) {
    if (/drawn|won/.test(text)) {
      return { category: "fouls_drawn", line: lineFromText ?? 0.5 };
    }
    return { category: "fouls_committed", line: lineFromText ?? 0.5 };
  }
  if (marketKey === "goals" || /goal|anytime|scorer/.test(text)) {
    return { category: "goals", line: lineFromText ?? 0.5 };
  }
  if (/tackle/.test(text)) {
    return { category: "tackles", line: lineFromText ?? 0.5 };
  }
  if (/save|gk/.test(text)) {
    return { category: "gk_saves", line: lineFromText ?? 2.5 };
  }
  return { category: "fouls_committed", line: lineFromText ?? 0.5 };
}

export function outcomesToBooleans(outcomes: FormOutcome[]): boolean[] {
  return outcomes.map((outcome) => outcome === "hit");
}

export function booleansToOutcomes(values: boolean[]): FormOutcome[] {
  return values.map((value) => (value ? "hit" : "miss"));
}

function primaryStatBlock(statistics: unknown): Record<string, unknown> | null {
  if (Array.isArray(statistics)) {
    return asRecord(statistics[0]);
  }
  return asRecord(statistics);
}

function extractMinutes(stats: Record<string, unknown> | null): number | null {
  if (!stats) return null;
  return asNumber(stats.minutes) ?? nest(stats, "games", "minutes");
}

function extractStat(
  stats: Record<string, unknown> | null,
  category: StatCategory,
): number | null {
  if (!stats) return null;
  const micro = asRecord(stats.micro);
  switch (category) {
    case "fouls_committed":
      return (
        asNumber(micro?.fouls_committed) ??
        asNumber(stats.fouls_committed) ??
        nest(stats, "fouls", "committed")
      );
    case "fouls_drawn":
      return (
        asNumber(micro?.fouls_won) ??
        asNumber(stats.fouls_won) ??
        nest(stats, "fouls", "drawn")
      );
    case "shots_on":
      return asNumber(micro?.sot) ?? asNumber(stats.sot) ?? nest(stats, "shots", "on");
    case "shots_total":
      return (
        asNumber(micro?.shots) ??
        asNumber(stats.shots_total) ??
        nest(stats, "shots", "total")
      );
    case "yellow": {
      const flat = asNumber(micro?.cards) ?? asNumber(stats.cards_total);
      if (flat != null) return flat;
      const yellow = nest(stats, "cards", "yellow") ?? 0;
      const red = nest(stats, "cards", "red") ?? 0;
      return yellow + red;
    }
    case "goals":
      return nest(stats, "goals", "total");
    case "tackles":
      return (
        asNumber(micro?.tackles) ??
        asNumber(stats.tackles_total) ??
        nest(stats, "tackles", "total")
      );
    case "gk_saves":
      return (
        asNumber(micro?.gk_saves) ??
        asNumber(stats.gk_saves) ??
        nest(stats, "goals", "saves")
      );
    default:
      return null;
  }
}

function nest(stats: Record<string, unknown>, group: string, key: string): number | null {
  const section = asRecord(stats[group]);
  if (!section) return null;
  return asNumber(section[key]);
}

function parseLine(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
