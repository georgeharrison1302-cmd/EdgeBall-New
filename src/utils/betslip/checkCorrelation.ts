/** Stable market tags for same-game slip conflict checks. */
export type SlipMarketKind =
  | "home_win"
  | "draw"
  | "away_win"
  | "btts_yes"
  | "btts_no"
  | "over_goals"
  | "under_goals"
  | "player_goals_over"
  | "clean_sheet"
  | "player_card"
  | "player_shots"
  | "player_fouls"
  | "other";

export type SlipLegLike = {
  id: string | number;
  label?: string;
  marketName: string;
  match?: string;
  player?: string;
  fixtureId?: number;
  marketKind?: SlipMarketKind;
  line?: number;
};

export type SlipConflict = {
  id: string;
  severity: "conflict";
  message: string;
  legIds: Array<string | number>;
};

const ONE_X_TWO = new Set<SlipMarketKind>(["home_win", "draw", "away_win"]);

/** Infer market kind + line from free-text when callers omit tags. */
export function classifySlipMarket(
  text: string,
  hint?: { marketKey?: string; pillKey?: string },
): { marketKind: SlipMarketKind; line?: number } {
  if (hint?.pillKey) {
    const fromPill = pillKeyToKind(hint.pillKey);
    if (fromPill) return fromPill;
  }
  const raw = text.toLowerCase();
  if (hint?.marketKey === "cards" || /to be carded|booked|yellow/.test(raw)) {
    return { marketKind: "player_card" };
  }
  if (hint?.marketKey === "sot" || hint?.marketKey === "shots" || /shots? on target|total shots/.test(raw)) {
    return { marketKind: "player_shots" };
  }
  if (hint?.marketKey === "fouls" || /fouls (committed|drawn)/.test(raw)) {
    return { marketKind: "player_fouls" };
  }
  if (/\bbtts\b.*\byes\b|\byes\b.*\bbtts\b|both teams to score\s*-?\s*yes/.test(raw)) {
    return { marketKind: "btts_yes" };
  }
  if (/\bbtts\b.*\bno\b|\bno\b.*\bbtts\b|both teams to score\s*-?\s*no/.test(raw)) {
    return { marketKind: "btts_no" };
  }
  if (/clean sheet/.test(raw)) return { marketKind: "clean_sheet" };
  const under = raw.match(/under\s+(\d+(?:\.\d+)?)/);
  if (under) return { marketKind: "under_goals", line: Number(under[1]) };
  const over = raw.match(/over\s+(\d+(?:\.\d+)?)/);
  if (over && !/player|anytime|scorer/.test(raw)) {
    return { marketKind: "over_goals", line: Number(over[1]) };
  }
  if (/\bdraw\b/.test(raw) && !/no bet/.test(raw)) return { marketKind: "draw" };
  if (/\bwin\b/.test(raw) && /home/.test(raw)) return { marketKind: "home_win" };
  if (/\bwin\b/.test(raw) && /away/.test(raw)) return { marketKind: "away_win" };
  // "Arsenal win" / team win without home/away — leave as other unless pill tagged
  if (/\bwin\b/.test(raw) && !/draw/.test(raw)) {
    // Ambiguous 1X2 from label alone — keep other unless explicit
  }
  const playerGoals = raw.match(/(?:anytime|to score|scorer).*?(\d+)\+|(\d+)\+\s*goals?|score\s*(\d+)\+/);
  if (playerGoals || /anytime scorer|to score/.test(raw)) {
    const line =
      Number(playerGoals?.[1] ?? playerGoals?.[2] ?? playerGoals?.[3] ?? 1) || 1;
    return { marketKind: "player_goals_over", line };
  }
  if (hint?.marketKey === "goals") {
    const n = raw.match(/(\d+)\+/);
    return { marketKind: "player_goals_over", line: n ? Number(n[1]) : 1 };
  }
  return { marketKind: "other" };
}

function pillKeyToKind(key: string): { marketKind: SlipMarketKind; line?: number } | null {
  switch (key) {
    case "home":
      return { marketKind: "home_win" };
    case "draw":
      return { marketKind: "draw" };
    case "away":
      return { marketKind: "away_win" };
    case "btts-yes":
      return { marketKind: "btts_yes" };
    case "btts-no":
      return { marketKind: "btts_no" };
    case "over25":
      return { marketKind: "over_goals", line: 2.5 };
    case "under25":
      return { marketKind: "under_goals", line: 2.5 };
    default:
      return null;
  }
}

function groupKey(leg: SlipLegLike): string {
  if (leg.fixtureId != null) return `f:${leg.fixtureId}`;
  const match = (leg.match ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return match ? `m:${match}` : `solo:${String(leg.id)}`;
}

function resolved(leg: SlipLegLike): SlipLegLike & { marketKind: SlipMarketKind; line?: number } {
  if (leg.marketKind) {
    return { ...leg, marketKind: leg.marketKind, line: leg.line };
  }
  const text = `${leg.label ?? ""} ${leg.marketName}`;
  const classified = classifySlipMarket(text);
  return { ...leg, marketKind: classified.marketKind, line: leg.line ?? classified.line };
}

/**
 * Same-game hard conflicts only. Cross-match accumulators never warn.
 */
export function checkCorrelation(legs: SlipLegLike[]): SlipConflict[] {
  if (legs.length < 2) return [];
  const resolvedLegs = legs.map(resolved);
  const groups = new Map<string, typeof resolvedLegs>();
  for (const leg of resolvedLegs) {
    const key = groupKey(leg);
    if (key.startsWith("solo:")) continue;
    const list = groups.get(key) ?? [];
    list.push(leg);
    groups.set(key, list);
  }

  const conflicts: SlipConflict[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const matchLabel = group[0].match?.trim() || "this match";

    const oneXTwo = group.filter((leg) => ONE_X_TWO.has(leg.marketKind));
    if (oneXTwo.length >= 2) {
      const kinds = new Set(oneXTwo.map((leg) => leg.marketKind));
      if (kinds.size >= 2) {
        conflicts.push({
          id: `1x2:${groupKey(group[0])}`,
          severity: "conflict",
          message: `Conflict: multiple 1X2 outcomes on ${matchLabel}.`,
          legIds: oneXTwo.map((leg) => leg.id),
        });
      }
    }

    const bttsYes = group.filter((leg) => leg.marketKind === "btts_yes");
    const bttsNo = group.filter((leg) => leg.marketKind === "btts_no");
    if (bttsYes.length && bttsNo.length) {
      conflicts.push({
        id: `btts:${groupKey(group[0])}`,
        severity: "conflict",
        message: `Conflict: BTTS Yes vs BTTS No on ${matchLabel}.`,
        legIds: [...bttsYes, ...bttsNo].map((leg) => leg.id),
      });
    }

    // Under 1.5 / 2.5 Goals + BTTS Yes forces a brittle 1-1 script.
    const unders = group.filter((leg) => leg.marketKind === "under_goals");
    if (bttsYes.length && unders.some((leg) => (leg.line ?? 99) <= 2.5)) {
      conflicts.push({
        id: `btts-under:${groupKey(group[0])}`,
        severity: "conflict",
        message: `Conflict: BTTS Yes vs Under Goals on ${matchLabel}.`,
        legIds: [...bttsYes, ...unders].map((leg) => leg.id),
      });
    }

    const cleans = group.filter((leg) => leg.marketKind === "clean_sheet");
    if (bttsYes.length && cleans.length) {
      conflicts.push({
        id: `btts-cs:${groupKey(group[0])}`,
        severity: "conflict",
        message: `Conflict: BTTS Yes vs Clean Sheet on ${matchLabel}.`,
        legIds: [...bttsYes, ...cleans].map((leg) => leg.id),
      });
    }

    const overs = group.filter((leg) => leg.marketKind === "over_goals");
    for (const under of unders) {
      for (const over of overs) {
        if (under.line != null && over.line != null && under.line === over.line) {
          conflicts.push({
            id: `ou:${groupKey(group[0])}:${under.line}`,
            severity: "conflict",
            message: `Conflict: Over ${over.line} vs Under ${under.line} on ${matchLabel}.`,
            legIds: [over.id, under.id],
          });
        }
      }
    }

    const playerGoals = group.filter((leg) => leg.marketKind === "player_goals_over");
    for (const under of unders) {
      if (under.line == null) continue;
      const minGoals = Math.floor(under.line) + 1;
      const bad = playerGoals.filter((leg) => (leg.line ?? 1) >= minGoals);
      if (bad.length) {
        conflicts.push({
          id: `under-player:${groupKey(group[0])}:${under.line}`,
          severity: "conflict",
          message: `Conflict: Under ${under.line} Goals vs Player ${minGoals}+ Goals on ${matchLabel}.`,
          legIds: [under.id, ...bad.map((leg) => leg.id)],
        });
      }
    }
  }

  // Dedupe by id
  const seen = new Set<string>();
  return conflicts.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
