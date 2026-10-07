/**
 * Live Odds-API.io → prematch_odds refresh for a fixture set.
 * Requests match + player-prop markets (fouls, shots, cards, tackles, saves).
 */
import { BET365_BOOKMAKER_ID, prematchBets } from "@/utils/api-football/bet-catalogs";
import { playerNamesMatch } from "@/lib/odds/matcher";
import { asList, oddsApiIoGet, redactOddsApiIo } from "@/utils/odds-api-io/client";
import { createIngestClient } from "@/utils/supabase/admin";

const SPORT = "football";
const BOOKMAKERS = "Bet365,Paddy Power";
const BOOKMAKER_IDS: Record<string, number> = {
  Bet365: BET365_BOOKMAKER_ID,
  "Paddy Power": 38,
};
const MULTI = 10;
const EVENTS_TTL_MS = 5 * 60 * 1000;

/** Markets we always request from Odds-API.io. */
export const ODDS_API_IO_MARKETS = [
  "ML",
  "Totals",
  "Both Teams To Score",
  "Player Fouls",
  "Player To Be Fouled",
  "Player Shots",
  "Player Shots on Target",
  "Player Tackles",
  "Goalkeeper Saves",
  "Player to be Booked",
  "Player Cards",
] as const;

type FixtureRow = {
  id: number;
  league_id: number;
  season: number;
  date: string;
  status_short: string;
  home_team_id: number | null;
  away_team_id: number | null;
  homeName: string;
  awayName: string;
};

type SquadPlayer = { player_id: number; name: string; team_id: number };

type OddsApiEvent = {
  id?: number | string;
  home?: string;
  away?: string;
  date?: string;
};

type OddsApiMarket = { name?: string; odds?: unknown[] };
type OddsApiOdds = { id?: number | string; bookmakers?: Record<string, OddsApiMarket[]> };

type OddsValue = {
  value: string;
  odd: string;
  player_id?: number;
  label?: string;
  handicap?: number;
};

type OddsBet = { id: number; name: string; values: OddsValue[] };

type OddsRow = {
  fixture_id: number;
  league_id: number | null;
  season: number | null;
  bookmaker_id: number;
  bookmaker_name: string | null;
  odds_data: { id: number; name: string; bets: OddsBet[] };
  updated_at: string;
};

type MappedMarket = {
  betId: number;
  betName: string;
  kind: "cards" | "line";
};

let eventsCache: { at: number; events: OddsApiEvent[] } | null = null;

export type OddsRefreshResult = {
  matched: number;
  upserted: number;
  playerProps: number;
  unmatchedLabels: number;
};

/**
 * Pull Bet365 / Paddy Power odds from Odds-API.io for the given fixtures
 * and upsert into `prematch_odds`.
 */
export async function refreshOddsForFixtures(
  fixtureIds: number[],
): Promise<OddsRefreshResult> {
  const ids = [...new Set(fixtureIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) {
    return { matched: 0, upserted: 0, playerProps: 0, unmatchedLabels: 0 };
  }

  const supabase = createIngestClient();
  const fixtures = await loadFixturesByIds(supabase, ids);
  if (fixtures.length === 0) {
    return { matched: 0, upserted: 0, playerProps: 0, unmatchedLabels: 0 };
  }

  const markets = [...ODDS_API_IO_MARKETS];
  const events = await listFootballEvents();
  const matched = matchFixtures(fixtures, events);
  if (matched.length === 0) {
    return { matched: 0, upserted: 0, playerProps: 0, unmatchedLabels: 0 };
  }

  const playersByFixture = await loadFixturePlayers(
    supabase,
    matched.map((item) => item.fixture),
  );

  const now = new Date().toISOString();
  const rows: OddsRow[] = [];
  let playerProps = 0;
  let unmatchedLabels = 0;

  for (let index = 0; index < matched.length; index += MULTI) {
    const batch = matched.slice(index, index + MULTI);
    const payload = await oddsApiIoGet<unknown>("/odds/multi", {
      eventIds: batch.map((item) => item.eventId).join(","),
      bookmakers: BOOKMAKERS,
      markets: markets.join(","),
    });
    const byEventId = new Map(
      asList<OddsApiOdds>(payload).map((item) => [String(item.id), item]),
    );

    for (const item of batch) {
      let books = byEventId.get(String(item.eventId))?.bookmakers ?? {};
      if (!hasPlayerMarkets(books)) {
        books = await fetchBooksPerBookmaker(String(item.eventId), markets);
      }
      const squad = playersByFixture.get(item.fixture.id) ?? [];

      for (const [bookmakerName, bookMarkets] of Object.entries(books)) {
        const bookmakerId = bookmakerIdFor(bookmakerName);
        if (bookmakerId == null) continue;
        const bets: OddsBet[] = [];
        const playerBuckets = new Map<number, { bet: OddsBet; values: OddsValue[] }>();

        for (const market of bookMarkets ?? []) {
          const marketName = String(market.name ?? "").trim();
          const key = marketName.toLowerCase();

          if (key === "ml") {
            const values = mlValues(market.odds?.[0]);
            if (values.length) {
              bets.push({ id: prematchBets.matchWinner, name: "Match Winner", values });
            }
            continue;
          }
          if (key === "totals") {
            const values = totals25(market.odds ?? []);
            if (values.length) {
              bets.push({ id: prematchBets.goalsOverUnder, name: "Goals Over/Under", values });
            }
            continue;
          }
          if (key === "both teams to score") {
            const values = yesNoValues(market.odds?.[0]);
            if (values.length) {
              bets.push({
                id: prematchBets.bothTeamsToScore,
                name: "Both Teams Score",
                values,
              });
            }
            continue;
          }

          const mapped = mapPlayerMarket(marketName);
          if (!mapped) continue;

          for (const prop of market.odds ?? []) {
            const parsed = parsePlayerMarketRow(prop, mapped.kind);
            if (!parsed) {
              unmatchedLabels += 1;
              continue;
            }
            // Prefer squad id when we can resolve it; still store name-only quotes
            // so Generator fuzzy lookup can attach prices later.
            const player = matchPlayer(parsed.name, squad);
            if (!player) unmatchedLabels += 1;

            const displayName = player?.name ?? parsed.name;
            const value: OddsValue = {
              value:
                parsed.line != null ? `${displayName} - ${parsed.line}` : displayName,
              odd: String(parsed.odd),
              ...(player ? { player_id: player.player_id } : {}),
              label: parsed.label,
              ...(parsed.line != null ? { handicap: parsed.line } : {}),
            };

            let bucket = playerBuckets.get(mapped.betId);
            if (!bucket) {
              bucket = {
                bet: { id: mapped.betId, name: mapped.betName, values: [] },
                values: [],
              };
              playerBuckets.set(mapped.betId, bucket);
            }
            bucket.values.push(value);
            playerProps += 1;
          }
        }

        for (const bucket of playerBuckets.values()) {
          bucket.bet.values = dedupePlayerValues(bucket.values);
          if (bucket.bet.values.length > 0) bets.push(bucket.bet);
        }

        if (bets.length === 0) continue;
        rows.push({
          fixture_id: item.fixture.id,
          league_id: item.fixture.league_id,
          season: item.fixture.season,
          bookmaker_id: bookmakerId,
          bookmaker_name: bookmakerName,
          odds_data: { id: bookmakerId, name: bookmakerName, bets },
          updated_at: now,
        });
      }
    }
  }

  const upsertRows = mergeOddsRows(rows);
  if (upsertRows.length > 0) {
    await upsertPrematch(supabase, upsertRows);
  }

  return {
    matched: matched.length,
    upserted: upsertRows.length,
    playerProps,
    unmatchedLabels,
  };
}

/** Collapse duplicate bookmaker feeds (e.g. Bet365 + Bet365 no-latency) into one row. */
function mergeOddsRows(rows: OddsRow[]) {
  const merged = new Map<string, OddsRow>();
  for (const row of rows) {
    const key = `${row.fixture_id}:${row.bookmaker_id}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, {
        ...row,
        odds_data: { ...row.odds_data, bets: row.odds_data.bets.map((bet) => ({ ...bet, values: [...bet.values] })) },
      });
      continue;
    }
    const byBet = new Map<number, OddsBet>();
    for (const bet of previous.odds_data.bets) byBet.set(bet.id, bet);
    for (const bet of row.odds_data.bets) {
      const existing = byBet.get(bet.id);
      if (!existing) {
        byBet.set(bet.id, { ...bet, values: [...bet.values] });
        continue;
      }
      byBet.set(bet.id, {
        ...existing,
        values: dedupePlayerValues([...existing.values, ...bet.values]),
      });
    }
    previous.odds_data = { ...previous.odds_data, bets: [...byBet.values()] };
    previous.updated_at = row.updated_at;
  }
  return [...merged.values()];
}

/** Best-effort refresh — never throws into the page render. */
export async function tryRefreshOddsForFixtures(fixtureIds: number[]) {
  try {
    return await refreshOddsForFixtures(fixtureIds);
  } catch (cause) {
    const message =
      cause instanceof Error ? redactOddsApiIo(cause.message) : redactOddsApiIo(String(cause));
    console.warn(`[odds-api.io] refresh skipped: ${message}`);
    return null;
  }
}

function hasPlayerMarkets(books: Record<string, OddsApiMarket[]>) {
  for (const markets of Object.values(books)) {
    for (const market of markets ?? []) {
      if (mapPlayerMarket(String(market.name ?? ""))) return true;
    }
  }
  return false;
}

/** Multi is sparse near kickoff — fall back to per-bookmaker /odds. */
async function fetchBooksPerBookmaker(eventId: string, markets: string[]) {
  const merged: Record<string, OddsApiMarket[]> = {};
  for (const book of ["Bet365", "Paddy Power"] as const) {
    try {
      const payload = await oddsApiIoGet<OddsApiOdds>("/odds", {
        eventId,
        bookmakers: book,
        markets: markets.join(","),
      });
      for (const [name, bookMarkets] of Object.entries(payload?.bookmakers ?? {})) {
        const existing = merged[name] ?? [];
        merged[name] = [...existing, ...(bookMarkets ?? [])];
      }
    } catch {
      // keep going — one book may still have lines
    }
  }
  return merged;
}

function mapPlayerMarket(marketName: string): MappedMarket | null {
  const key = marketName.trim().toLowerCase();
  if (!key) return null;

  if (
    key === "player to be booked" ||
    key === "player cards" ||
    (key.includes("player") && (key.includes("book") || key.includes("card")))
  ) {
    return {
      betId: prematchBets.playerToBeBooked,
      betName: "Player to be booked",
      kind: "cards",
    };
  }
  if (key === "player to be fouled" || key.includes("to be fouled")) {
    return {
      betId: prematchBets.playerFoulsDrawn,
      betName: "Player To Be Fouled",
      kind: "line",
    };
  }
  if (key === "player fouls" || (key.includes("player") && key.includes("foul"))) {
    return {
      betId: prematchBets.playerFoulsCommitted,
      betName: "Player Fouls",
      kind: "line",
    };
  }
  if (key === "player shots on target" || key.includes("shots on target")) {
    return {
      betId: prematchBets.homePlayerShotsOnTarget,
      betName: "Player Shots on Target",
      kind: "line",
    };
  }
  if (key === "player shots" || (key.includes("player") && key.includes("shot"))) {
    return {
      betId: prematchBets.homePlayerShots,
      betName: "Player Shots",
      kind: "line",
    };
  }
  if (key === "player tackles" || key.includes("tackle")) {
    return {
      betId: prematchBets.playerTacklesAny,
      betName: "Player Tackles",
      kind: "line",
    };
  }
  if (key === "goalkeeper saves" || (key.includes("goalkeeper") && key.includes("save"))) {
    return {
      betId: prematchBets.goalkeeperSaves,
      betName: "Goalkeeper Saves",
      kind: "line",
    };
  }
  return null;
}

function parsePlayerMarketRow(
  raw: unknown,
  kind: "cards" | "line",
): { name: string; label: string; odd: number; line: number | null } | null {
  const rec = asRecord(raw);
  const label = String(rec.label ?? "").trim();
  if (!label) return null;

  if (kind === "cards") {
    const name = bookingPlayerName(label);
    if (!name) return null;
    const price = Number(rec.yes ?? rec.odd ?? rec.odds ?? rec.price ?? rec.over);
    if (!Number.isFinite(price) || price <= 1) return null;
    return { name, label, odd: price, line: null };
  }

  const name = linePlayerName(label);
  if (!name) return null;
  const price = Number(rec.over ?? rec.yes ?? rec.odd ?? rec.odds ?? rec.price);
  if (!Number.isFinite(price) || price <= 1) return null;
  const hdp = Number(rec.hdp ?? rec.handicap ?? rec.line ?? rec.max);
  const line = Number.isFinite(hdp) ? hdp : null;
  return { name, label, odd: price, line };
}

/** "Aaron Hickey (1)" → name (paren is shirt #, line is `hdp`). */
function linePlayerName(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s*\(\d+\)\s*$/, "").trim() || null;
}

function bookingPlayerName(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const paren = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const outcome = paren[2]!.trim().toLowerCase();
    if (outcome.includes("sent off") || outcome.includes("red")) return null;
    if (outcome.includes("1st") || outcome.includes("first")) return null;
    // Jersey-only paren on a card market — treat as name.
    if (/^\d+$/.test(outcome)) {
      return paren[1]!.trim() || null;
    }
    if (!(outcome.includes("book") || outcome === "card" || outcome.includes("yellow"))) {
      return null;
    }
    return paren[1]!.trim() || null;
  }
  return trimmed;
}

/** Dedupe player-line quotes. Preserves ML/totals; name-only props key on name+line. */
function dedupePlayerValues(values: OddsValue[]) {
  const nonPlayer: OddsValue[] = [];
  const byKey = new Map<string, OddsValue>();
  for (const value of values) {
    const playerId = Number(value.player_id);
    const line = value.handicap ?? "any";
    if (Number.isInteger(playerId) && playerId > 0) {
      const key = `id:${playerId}:${line}`;
      const previous = byKey.get(key);
      if (!previous || Number(value.odd) < Number(previous.odd)) byKey.set(key, value);
      continue;
    }
    const isPlayerProp =
      Boolean(value.label) ||
      value.handicap != null ||
      /\s-\s\d+(?:\.\d+)?$/.test(String(value.value ?? ""));
    if (!isPlayerProp) {
      nonPlayer.push(value);
      continue;
    }
    const name = normalize(
      String(value.value ?? value.label ?? "").replace(/\s+-\s+[\d.]+$/, ""),
    );
    if (!name) {
      nonPlayer.push(value);
      continue;
    }
    const key = `name:${name}:${line}`;
    const previous = byKey.get(key);
    if (!previous || Number(value.odd) < Number(previous.odd)) byKey.set(key, value);
  }
  return [...nonPlayer, ...byKey.values()];
}

async function listFootballEvents() {
  const now = Date.now();
  if (eventsCache && now - eventsCache.at < EVENTS_TTL_MS) return eventsCache.events;

  // Include fixtures that kicked off recently (live / just started) as well as upcoming.
  const from = new Date(now - 6 * 60 * 60 * 1000);
  const to = new Date(now + 7 * 24 * 60 * 60 * 1000);
  const events: OddsApiEvent[] = [];
  const limit = 500;
  for (let skip = 0; skip < 5000; skip += limit) {
    const payload = await oddsApiIoGet<unknown>("/events", {
      sport: SPORT,
      from: from.toISOString(),
      to: to.toISOString(),
      limit,
      skip,
    });
    const page = asList<OddsApiEvent>(payload);
    events.push(...page);
    if (page.length < limit) break;
  }
  eventsCache = { at: now, events };
  return events;
}

async function loadFixturesByIds(
  supabase: ReturnType<typeof createIngestClient>,
  fixtureIds: number[],
) {
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, league_id, season, date, home_team_id, away_team_id, status_short")
    .in("id", fixtureIds);
  if (error) throw error;
  const raw = data ?? [];
  const teamIds = uniqueNumbers(
    raw.flatMap((row) => [Number(row.home_team_id), Number(row.away_team_id)]),
  );
  const { data: teams, error: teamError } =
    teamIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("teams").select("id, name").in("id", teamIds);
  if (teamError) throw teamError;
  const teamById = new Map((teams ?? []).map((team) => [Number(team.id), String(team.name ?? "")]));

  return raw.flatMap((row) => {
    const id = Number(row.id);
    const homeName = teamById.get(Number(row.home_team_id)) ?? "";
    const awayName = teamById.get(Number(row.away_team_id)) ?? "";
    if (!Number.isInteger(id) || !homeName || !awayName || !row.date) return [];
    return [
      {
        id,
        league_id: Number(row.league_id) || 0,
        season: Number(row.season) || 2026,
        date: String(row.date),
        status_short: String(row.status_short ?? "NS"),
        home_team_id: Number(row.home_team_id) || null,
        away_team_id: Number(row.away_team_id) || null,
        homeName,
        awayName,
      } satisfies FixtureRow,
    ];
  });
}

async function loadFixturePlayers(
  supabase: ReturnType<typeof createIngestClient>,
  fixtures: FixtureRow[],
) {
  const teamIds = uniqueNumbers(
    fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]),
  );
  const map = new Map<number, SquadPlayer[]>();
  if (teamIds.length === 0) return map;

  const { data: squads, error: squadError } = await supabase
    .from("team_squads")
    .select("team_id, player_id, player_name")
    .in("team_id", teamIds);
  if (squadError) throw squadError;

  const playerIds = uniqueNumbers((squads ?? []).map((row) => Number(row.player_id)));
  const profiles: Array<{ player_id: number; name: string | null }> = [];
  for (let index = 0; index < playerIds.length; index += 200) {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("player_id, name")
      .in("player_id", playerIds.slice(index, index + 200));
    if (error) throw error;
    profiles.push(...((data ?? []) as typeof profiles));
  }
  const profileById = new Map(profiles.map((row) => [Number(row.player_id), row.name]));

  const byTeam = new Map<number, SquadPlayer[]>();
  for (const row of squads ?? []) {
    const playerId = Number(row.player_id);
    const teamId = Number(row.team_id);
    const name = profileById.get(playerId) ?? row.player_name;
    if (!Number.isInteger(playerId) || !Number.isInteger(teamId) || !name) continue;
    const list = byTeam.get(teamId) ?? [];
    list.push({ player_id: playerId, name: String(name), team_id: teamId });
    byTeam.set(teamId, list);
  }

  for (const fixture of fixtures) {
    map.set(fixture.id, [
      ...(byTeam.get(fixture.home_team_id ?? -1) ?? []),
      ...(byTeam.get(fixture.away_team_id ?? -1) ?? []),
    ]);
  }
  return map;
}

function matchPlayer(label: string, players: SquadPlayer[]) {
  const hits = players.filter((player) => playerNamesMatch(label, player.name));
  if (hits.length === 1) return hits[0]!;
  const exact = hits.filter(
    (player) => player.name.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  if (exact.length === 1) return exact[0]!;
  return null;
}

function matchFixtures(fixtures: FixtureRow[], events: OddsApiEvent[]) {
  const matched: Array<{ fixture: FixtureRow; eventId: string }> = [];
  for (const fixture of fixtures) {
    let best: { event: OddsApiEvent; score: number } | null = null;
    for (const event of events) {
      if (event.id == null || !event.home || !event.away || !event.date) continue;
      const kickoffGap = Math.abs(
        new Date(fixture.date).getTime() - new Date(event.date).getTime(),
      );
      if (!Number.isFinite(kickoffGap) || kickoffGap > 18 * 60 * 60 * 1000) continue;
      const home = nameScore(fixture.homeName, event.home);
      const away = nameScore(fixture.awayName, event.away);
      if (home < 0.45 || away < 0.45) continue;
      const score = home + away;
      if (!best || score > best.score) best = { event, score };
    }
    if (!best) continue;
    matched.push({ fixture, eventId: String(best.event.id) });
  }
  return matched;
}

function nameScore(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.length === 0 || b.length === 0) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.some((other) => other === token || other.includes(token) || token.includes(other))) {
      hits += 1;
    }
  }
  return hits / Math.max(a.length, b.length);
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((part) => part.length > 1 && !STOP.has(part));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["fc", "cf", "sc", "afc", "the", "of", "and", "de", "club"]);

function bookmakerIdFor(name: string) {
  const exact = BOOKMAKER_IDS[name];
  if (exact != null) return exact;
  // "Bet365 (no latency)" → Bet365
  const base = name.replace(/\s*\(.*\)\s*$/, "").trim();
  if (BOOKMAKER_IDS[base] != null) return BOOKMAKER_IDS[base]!;
  const wanted = name.toLowerCase();
  for (const [book, id] of Object.entries(BOOKMAKER_IDS)) {
    if (wanted.startsWith(book.toLowerCase())) return id;
  }
  return null;
}

function mlValues(row: unknown): OddsValue[] {
  const rec = asRecord(row);
  return [
    oddValue("Home", rec.home),
    oddValue("Draw", rec.draw),
    oddValue("Away", rec.away),
  ].filter((item): item is OddsValue => item != null);
}

function totals25(rows: unknown[]): OddsValue[] {
  const values: OddsValue[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    const line = Number(rec.max ?? rec.hdp ?? rec.handicap ?? rec.line);
    if (line !== 2.5) continue;
    const over = oddValue("Over 2.5", rec.over);
    const under = oddValue("Under 2.5", rec.under);
    if (over) values.push(over);
    if (under) values.push(under);
  }
  return values;
}

function yesNoValues(row: unknown): OddsValue[] {
  const rec = asRecord(row);
  return [oddValue("Yes", rec.yes ?? rec.Yes), oddValue("No", rec.no ?? rec.No)].filter(
    (item): item is OddsValue => item != null,
  );
}

function oddValue(value: string, odd: unknown): OddsValue | null {
  const price = Number(odd);
  if (!value || !Number.isFinite(price) || price <= 1) return null;
  return { value, odd: String(price) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function upsertPrematch(
  supabase: ReturnType<typeof createIngestClient>,
  rows: OddsRow[],
) {
  const size = 50;
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await supabase
      .from("prematch_odds")
      .upsert(rows.slice(index, index + size), { onConflict: "fixture_id,bookmaker_id" });
    if (error) throw new Error(error.message);
  }
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [
    ...new Set(
      values.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
