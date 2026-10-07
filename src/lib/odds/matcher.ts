import { normalizePlayerName } from "@/utils/odds/player-prop-value";

/**
 * Fuzzy player-name matcher for joining API-Football stats ↔ Odds-API labels.
 *
 * Step A — exact normalized equality ("Bukayo Saka" === "Bukayo Saka").
 * Step B — last-name token (split on spaces/dots: "B. Saka" → "Saka") is
 *          `.includes()`'d in the other name.
 * Step C — initial + last ("J. McGinn" ↔ "John McGinn").
 */

/** Last token after normalizing spaces/dots (e.g. "B. Saka" → "saka"). */
export function lastNameToken(name: string): string {
  const parts = normalizePlayerName(name)
    .split(" ")
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * True when `apiName` (API-Football / squad) matches `oddsName` (book label).
 */
export function playerNamesMatch(apiName: string, oddsName: string): boolean {
  const left = normalizePlayerName(apiName);
  const right = normalizePlayerName(oddsName);
  if (!left || !right) return false;

  // Step A — exact
  if (left === right) return true;

  const lastLeft = lastNameToken(apiName);
  const lastRight = lastNameToken(oddsName);

  // Step B — surname `.includes()` in the other full name (min 3 chars)
  if (lastNameContained(lastLeft, right)) return true;
  if (lastNameContained(lastRight, left)) return true;

  // Step C — "j mcginn" ↔ "john mcginn"
  if (initialLastMatch(left, right) || initialLastMatch(right, left)) return true;

  return false;
}

/**
 * Pick a unique matching quote from candidates. Returns null when none match
 * or when multiple distinct prices collide on the same last-name hit.
 */
export function pickUniqueNameMatch<T extends { player: string; odd: number }>(
  apiName: string,
  candidates: T[],
): T | null {
  const hits = candidates.filter(
    (row) => Number.isFinite(row.odd) && row.odd > 1 && playerNamesMatch(apiName, row.player),
  );
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  const firstOdd = hits[0]!.odd;
  if (hits.every((hit) => hit.odd === firstOdd)) return hits[0]!;
  return null;
}

/**
 * Last-name containment: prefer whole-token equality, then `.includes()` on
 * the full haystack / tokens (guards short initials like "Jo").
 */
function lastNameContained(last: string, haystack: string): boolean {
  if (last.length < 3) return false;
  if (haystack === last) return true;
  // Spec: last name `.includes()` in Odds-API / API-Football name string
  if (haystack.includes(last)) return true;
  const tokens = haystack.split(" ").filter((token) => token.length >= 3);
  if (tokens.includes(last)) return true;
  return tokens.some((token) => token.includes(last) || last.includes(token));
}

/** "j mcginn" matches "john mcginn" when last tokens equal and first initials align. */
function initialLastMatch(compact: string, full: string): boolean {
  const a = compact.split(" ").filter(Boolean);
  const b = full.split(" ").filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;
  const aLast = a[a.length - 1]!;
  const bLast = b[b.length - 1]!;
  if (aLast.length < 3 || aLast !== bLast) return false;
  return a[0]![0] === b[0]![0];
}

/**
 * Implied decimal odds from a Poisson / empirical hit-rate percentage.
 * `modelOdds = 1 / (hitRate / 100)` (e.g. 80% → 1.25).
 * Clamps extreme rates so the Generator always has a Fair Price fallback.
 */
export function modelOddsFromHitRate(hitRate: number): number | null {
  if (!Number.isFinite(hitRate) || hitRate <= 0) return null;
  const rate = Math.min(Math.max(hitRate, 0.5), 99.5);
  const implied = 1 / (rate / 100);
  if (!Number.isFinite(implied) || implied <= 1) return null;
  return Math.round(implied * 100) / 100;
}

/** Bookmaker odds when priced, otherwise model fair price. */
export function effectiveLegOdds(
  bookmakerOdds: number | null | undefined,
  modelOdds: number | null | undefined,
): number | null {
  if (bookmakerOdds != null && Number.isFinite(bookmakerOdds) && bookmakerOdds > 1) {
    return bookmakerOdds;
  }
  if (modelOdds != null && Number.isFinite(modelOdds) && modelOdds > 1) {
    return modelOdds;
  }
  return null;
}
