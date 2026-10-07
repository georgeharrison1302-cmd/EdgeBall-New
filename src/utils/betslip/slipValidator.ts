import { normalizePlayerName } from "@/utils/odds/player-prop-value";

/**
 * Generator slip validation — player subsumption + same-match conflict matrix.
 * Used by AdvancedGenerator while scanning the ranked EV list.
 */

export type GeneratorLegLike = {
  id: number | string;
  match: string;
  selection: string;
  marketType: string;
  edgePct?: number | null;
  hitRate?: number;
  playerId?: number | null;
  playerName?: string | null;
  lineHalf?: number | null;
};

export type SlipRejectReason =
  | "duplicate_id"
  | "player_already_on_slip"
  | "market_conflict"
  | "game_script_conflict";

export type SlipValidation =
  | { ok: true; playerKey: string | null }
  | { ok: false; reason: SlipRejectReason; detail: string };

const PLAYER_MARKETS = new Set([
  "Shots on Target",
  "Total Shots",
  "To Be Carded",
  "Fouls Committed",
  "Fouls Drawn",
  "Tackles",
  "GK Saves",
]);

const ATTACKING_MARKETS = new Set(["Shots on Target", "Total Shots"]);

/** Integer clear line from "2+ Shots" / half-line 1.5 → 2. */
export function clearLineFromLeg(leg: GeneratorLegLike): number | null {
  if (leg.lineHalf != null && Number.isFinite(leg.lineHalf)) {
    return Math.ceil(leg.lineHalf);
  }
  const match = leg.selection.match(/(\d+)\+/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isPlayerMarket(marketType: string): boolean {
  return PLAYER_MARKETS.has(marketType);
}

/**
 * Stable player key for subsumption. Prefers playerId, then playerName,
 * then parses leading name from "Bukayo Saka 2+ Shots on Target".
 */
export function playerKeyForLeg(leg: GeneratorLegLike): string | null {
  if (!isPlayerMarket(leg.marketType)) return null;
  if (leg.playerId != null && Number.isInteger(leg.playerId) && leg.playerId > 0) {
    return `id:${leg.playerId}`;
  }
  if (leg.playerName?.trim()) {
    return `name:${normalizePlayerName(leg.playerName)}`;
  }
  const parsed = leg.selection.match(
    /^(.+?)\s+(?:\d+\+|To Be Carded|Over\s+\d)/i,
  );
  if (parsed?.[1]) return `name:${normalizePlayerName(parsed[1])}`;
  return null;
}

function sameMatch(a: GeneratorLegLike, b: GeneratorLegLike): boolean {
  return normalizeMatch(a.match) === normalizeMatch(b.match);
}

function normalizeMatch(match: string): string {
  return match.toLowerCase().replace(/\s+/g, " ").trim();
}

function goalsUnderLine(leg: GeneratorLegLike): number | null {
  if (leg.marketType === "Under 2.5") return 2.5;
  const text = leg.selection.toLowerCase();
  const under = text.match(/under\s+(\d+(?:\.\d+)?)/);
  if (under) return Number(under[1]);
  return null;
}

function isBttsYes(leg: GeneratorLegLike): boolean {
  if (leg.marketType !== "BTTS") return false;
  return /\byes\b/i.test(leg.selection);
}

function isBttsNo(leg: GeneratorLegLike): boolean {
  if (leg.marketType !== "BTTS") return false;
  return /\bno\b/i.test(leg.selection);
}

type ResultSide = "home" | "away" | "draw";

function matchWinnerSide(leg: GeneratorLegLike): ResultSide | null {
  if (leg.marketType !== "Match Winner") return null;
  const text = leg.selection.toLowerCase();
  if (/\bdraw\b/.test(text)) return "draw";
  if (/\bhome\b/.test(text) || /\b1\b/.test(text) && !/\b2\b/.test(text)) return "home";
  if (/\baway\b/.test(text) || /\b2\b/.test(text) && !/\b1\b/.test(text)) return "away";
  if (/\bwin\b/.test(text)) {
    // "Arsenal Win" — ambiguous without home/away tags; leave null
    return null;
  }
  return null;
}

/** Sides covered by a Double Chance / DNB selection. */
function coveredSides(leg: GeneratorLegLike): Set<ResultSide> | null {
  const text = leg.selection.toLowerCase().replace(/\s+/g, " ");
  if (leg.marketType === "Double Chance") {
    if (/\b1x\b|home\s*or\s*draw|draw\s*or\s*home/.test(text)) {
      return new Set(["home", "draw"]);
    }
    if (/\bx2\b|away\s*or\s*draw|draw\s*or\s*away/.test(text)) {
      return new Set(["away", "draw"]);
    }
    if (/\b12\b|home\s*or\s*away|away\s*or\s*home/.test(text)) {
      return new Set(["home", "away"]);
    }
  }
  if (leg.marketType === "Draw No Bet") {
    if (/\bhome\b/.test(text)) return new Set(["home"]);
    if (/\baway\b/.test(text)) return new Set(["away"]);
  }
  return null;
}

function isHighAttackingProp(leg: GeneratorLegLike): boolean {
  if (!ATTACKING_MARKETS.has(leg.marketType)) return false;
  const clear = clearLineFromLeg(leg);
  return clear != null && clear >= 3;
}

/**
 * Same-match conflict matrix (Rule A / B / C).
 * Returns a human detail string when the candidate conflicts with the slip.
 */
export function checkMarketConflicts(
  currentSlip: GeneratorLegLike[],
  candidateLeg: GeneratorLegLike,
): string | null {
  const same = currentSlip.filter((leg) => sameMatch(leg, candidateLeg));
  if (same.length === 0) return null;

  const withCandidate = [...same, candidateLeg];

  // Rule A — Under 1.5/2.5 Goals + BTTS Yes
  const unders = withCandidate
    .map((leg) => ({ leg, line: goalsUnderLine(leg) }))
    .filter((row): row is { leg: GeneratorLegLike; line: number } => row.line != null);
  const bttsYes = withCandidate.filter(isBttsYes);
  if (bttsYes.length > 0 && unders.some((row) => row.line <= 2.5)) {
    return `BTTS Yes conflicts with Under Goals on ${candidateLeg.match}`;
  }

  // BTTS Yes vs No
  if (withCandidate.some(isBttsYes) && withCandidate.some(isBttsNo)) {
    return `BTTS Yes vs BTTS No on ${candidateLeg.match}`;
  }

  // Over vs Under same line
  for (const under of unders) {
    for (const leg of withCandidate) {
      if (leg.marketType !== "Over 2.5" && !/over\s+\d/i.test(leg.selection)) continue;
      const overMatch = leg.selection.toLowerCase().match(/over\s+(\d+(?:\.\d+)?)/);
      const overLine =
        leg.marketType === "Over 2.5" ? 2.5 : overMatch ? Number(overMatch[1]) : null;
      if (overLine != null && under.line === overLine) {
        return `Over ${overLine} vs Under ${under.line} on ${candidateLeg.match}`;
      }
    }
  }

  // Rule B — Match Winner vs opposing Double Chance / DNB
  for (const a of withCandidate) {
    const win = matchWinnerSide(a);
    if (!win) continue;
    for (const b of withCandidate) {
      if (a.id === b.id) continue;
      const covers = coveredSides(b);
      if (!covers) continue;
      if (!covers.has(win)) {
        return `Match Winner (${a.selection}) conflicts with ${b.marketType} (${b.selection}) on ${candidateLeg.match}`;
      }
    }
  }

  // Mutually exclusive 1X2
  const winners = withCandidate
    .map(matchWinnerSide)
    .filter((side): side is ResultSide => side != null);
  if (new Set(winners).size >= 2) {
    return `Multiple Match Winner outcomes on ${candidateLeg.match}`;
  }

  // Rule C — Under 1.5 + high-line attacking props (3+ SOT / Shots)
  const under15 = unders.some((row) => row.line <= 1.5);
  const highAttack = withCandidate.filter(isHighAttackingProp);
  if (under15 && highAttack.length > 0) {
    return `Under 1.5 Goals conflicts with high attacking props (3+) on ${candidateLeg.match}`;
  }
  // Soft block: Under 2.5 + 2+ high attacking legs from different players
  const under25 = unders.some((row) => row.line <= 2.5);
  if (under25 && highAttack.length >= 2) {
    return `Under 2.5 Goals with multiple 3+ shot props on ${candidateLeg.match}`;
  }

  return null;
}

/**
 * Full SlipValidator gate: duplicate id, player subsumption, conflict matrix.
 */
export function validateSlipCandidate(
  currentSlip: GeneratorLegLike[],
  candidateLeg: GeneratorLegLike,
  seenPlayerKeys?: Set<string>,
): SlipValidation {
  if (currentSlip.some((leg) => String(leg.id) === String(candidateLeg.id))) {
    return { ok: false, reason: "duplicate_id", detail: "Leg already on slip" };
  }

  const playerKey = playerKeyForLeg(candidateLeg);
  const seen = seenPlayerKeys ?? seenPlayersFromSlip(currentSlip);
  if (playerKey && seen.has(playerKey)) {
    return {
      ok: false,
      reason: "player_already_on_slip",
      detail: `Player already used on slip (${playerKey})`,
    };
  }

  const conflict = checkMarketConflicts(currentSlip, candidateLeg);
  if (conflict) {
    const reason: SlipRejectReason =
      /Under 1\.5|high attacking|Under 2\.5 Goals with multiple/i.test(conflict)
        ? "game_script_conflict"
        : "market_conflict";
    return { ok: false, reason, detail: conflict };
  }

  return { ok: true, playerKey };
}

export function seenPlayersFromSlip(slip: GeneratorLegLike[]): Set<string> {
  const seen = new Set<string>();
  for (const leg of slip) {
    const key = playerKeyForLeg(leg);
    if (key) seen.add(key);
  }
  return seen;
}

/**
 * Scan a pre-ranked EV list and keep the first `legs` candidates that pass validation.
 * Favours highest edge/hit-rate because the input list must already be sorted that way
 * (one player → first encounter wins = best-ranked leg for that player).
 */
export function buildValidatedSlipFromRanked<T extends GeneratorLegLike>(
  ranked: T[],
  legs: number,
): T[] {
  const slip: T[] = [];
  const seenPlayers = new Set<string>();
  for (const candidate of ranked) {
    if (slip.length >= legs) break;
    const result = validateSlipCandidate(slip, candidate, seenPlayers);
    if (!result.ok) continue;
    slip.push(candidate);
    if (result.playerKey) seenPlayers.add(result.playerKey);
  }
  return slip;
}

/** Edge-first ranking helper for generator EV lists. */
export function compareByEdgeThenHit(
  left: { edgePct?: number | null; hitRate?: number; odds?: number | null },
  right: { edgePct?: number | null; hitRate?: number; odds?: number | null },
): number {
  const leftEdge = left.edgePct != null && Number.isFinite(left.edgePct) ? left.edgePct : null;
  const rightEdge = right.edgePct != null && Number.isFinite(right.edgePct) ? right.edgePct : null;
  if (leftEdge != null || rightEdge != null) {
    return (rightEdge ?? Number.NEGATIVE_INFINITY) - (leftEdge ?? Number.NEGATIVE_INFINITY);
  }
  return (right.hitRate ?? 0) - (left.hitRate ?? 0);
}
