/**
 * Odds-API.io v3 → prematch_odds and live_odds.
 * The only permitted betting-odds source. Markets are string names, not integer bet ids.
 *
 *   npm run sync:odds-api-io
 *   npm run sync:odds-api-io:loop
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
const LOOP_MS = 60_000;
const EVENTS_TTL_MS = 5 * 60 * 1000;
const CHUNK = 500;
const MULTI = 10;
const WINDOW_DAYS = 7;
const UPCOMING_STATUSES = ["NS", "TBD", "PST", "1H", "HT", "2H", "LIVE"] as const;
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
const CORE_MARKETS = ["ML", "Totals", "Both Teams To Score"];

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

type SquadPlayer = {
  player_id: number;
  name: string;
  team_id: number;
};

type OddsApiEvent = {
  id?: number | string;
  home?: string;
  away?: string;
  date?: string;
  league?: string;
};

type OddsApiMarket = {
  name?: string;
  odds?: unknown[];
};

type OddsApiOdds = {
  id?: number | string;
  bookmakers?: Record<string, OddsApiMarket[]>;
};

type OddsValue = {
  value: string;
  odd: string;
  player_id?: number;
  label?: string;
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

let eventsCache: { at: number; events: OddsApiEvent[] } | null = null;
let playerDirectory: SquadPlayer[] | null = null;
let loggedMarkets = false;

async function main() {
  const loop = process.argv.includes("--loop");
  const supabase = createIngestClient();
  do {
    await runCycle(supabase);
    if (loop) {
      console.log(`odds-api.io sleeping ${LOOP_MS / 1000}s`);
      await sleep(LOOP_MS);
    }
  } while (loop);
}

async function runCycle(supabase: ReturnType<typeof createIngestClient>) {
  const fixtures = await loadFixtures(supabase);
  if (fixtures.length === 0) {
    console.log("odds-api.io skipped (no upcoming/live fixtures)");
    return;
  }

  const { refreshOddsForFixtures } = await import("@/utils/odds-api-io/refresh");
  const result = await refreshOddsForFixtures(fixtures.map((fixture) => fixture.id));
  console.log(
    `odds-api.io matched=${result.matched} upserted=${result.upserted} playerProps=${result.playerProps} unmatchedLabels=${result.unmatchedLabels}`,
  );
}

async function logAndResolveCardMarkets() {
  const payload = await oddsApiIoGet<unknown>("/markets", { sport: SPORT }, false);
  if (!loggedMarkets) {
    console.log("odds-api.io GET /v3/markets?sport=football");
    console.log(JSON.stringify(payload, null, 2));
    loggedMarkets = true;
  }

  const names = marketNames(payload);
  const cards = names.filter((name) => isCardPropMarket(name, []));
  console.log(
    `odds-api.io football markets=${names.length} cardPropMarkets=${cards.join(" | ") || "(none)"}`,
  );
  return cards.length > 0 ? cards : ["Player Props - Cards", "Player to be Booked", "Player Cards"];
}

function marketNames(payload: unknown) {
  const list = asList<unknown>(payload);
  return uniqueStrings(
    list.map((item) => {
      if (typeof item === "string") return item.trim();
      const rec = asRecord(item);
      return String(rec.name ?? rec.market ?? "").trim();
    }),
  );
}

function isCardPropMarket(name: string, known: string[]) {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  if (known.some((item) => item.toLowerCase() === key)) return true;
  if (key === "player props - cards" || key === "player cards") return true;
  if (key.includes("player props") && key.includes("card")) return true;
  if (key.includes("player to be booked")) return true;
  if (key.includes("player") && (key.includes("book") || key.includes("card"))) return true;
  return false;
}

/** Odds-API.io labels are often "Alexander Prass (Booked)" or a bare player name. */
function bookingPlayerName(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const paren = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const outcome = paren[2].trim().toLowerCase();
    if (outcome.includes("sent off") || outcome.includes("red")) return null;
    if (outcome.includes("1st") || outcome.includes("first")) return null;
    if (!(outcome.includes("book") || outcome === "card" || outcome.includes("yellow"))) {
      return null;
    }
    const name = paren[1].trim();
    return name || null;
  }
  return trimmed;
}

function dedupeCardValues(values: OddsValue[]) {
  const byPlayer = new Map<number, OddsValue>();
  for (const value of values) {
    const playerId = Number(value.player_id);
    if (!Number.isInteger(playerId)) continue;
    const previous = byPlayer.get(playerId);
    if (!previous || Number(value.odd) < Number(previous.odd)) byPlayer.set(playerId, value);
  }
  return [...byPlayer.values()];
}

async function listFootballEvents() {
  const now = Date.now();
  if (eventsCache && now - eventsCache.at < EVENTS_TTL_MS) return eventsCache.events;

  const from = new Date();
  const to = new Date(from.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
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

async function loadFixtures(supabase: ReturnType<typeof createIngestClient>) {
  const from = new Date();
  const to = new Date(from.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const select = "id, league_id, season, date, home_team_id, away_team_id, status_short";
  const [{ data: upcoming, error: upcomingError }, { data: live, error: liveError }] = await Promise.all([
    supabase
      .from("fixtures")
      .select(select)
      .in("status_short", [...UPCOMING_STATUSES])
      .gte("date", from.toISOString())
      .lt("date", to.toISOString())
      .order("date")
      .limit(500),
    supabase.from("fixtures").select(select).in("status_short", [...LIVE_STATUSES]).limit(100),
  ]);
  if (upcomingError) throw upcomingError;
  if (liveError) throw liveError;
  const raw = [
    ...new Map(
      [...(upcoming ?? []), ...(live ?? [])].map((row) => [Number(row.id), row]),
    ).values(),
  ];
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
    const players = [
      ...(byTeam.get(fixture.home_team_id ?? -1) ?? []),
      ...(byTeam.get(fixture.away_team_id ?? -1) ?? []),
    ];
    map.set(fixture.id, players);
  }
  return map;
}

async function loadPlayerDirectory(supabase: ReturnType<typeof createIngestClient>) {
  if (playerDirectory) return playerDirectory;
  const directory: SquadPlayer[] = [];
  const page = 1000;
  for (let from = 0; from < 80_000; from += page) {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("player_id, name")
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const playerId = Number(row.player_id);
      const name = String(row.name ?? "").trim();
      if (!Number.isInteger(playerId) || !name) continue;
      directory.push({ player_id: playerId, name, team_id: 0 });
    }
    if (rows.length < page) break;
  }
  playerDirectory = directory;
  return directory;
}

function matchPlayer(label: string, players: SquadPlayer[], allowLastNameOnly = true) {
  const needle = normalize(label);
  if (!needle) return null;
  const exact = players.find((player) => normalize(player.name) === needle);
  if (exact) return exact;
  // Fuzzy: last-name / initial containment (API-Football ↔ Odds-API.io labels)
  const fuzzyHits = players.filter((player) => playerNamesMatch(label, player.name));
  if (fuzzyHits.length === 1) return fuzzyHits[0]!;
  const lastInitial = lastNameInitialKey(label);
  const initialHits = players.filter((player) => lastNameInitialKey(player.name) === lastInitial);
  if (lastInitial && initialHits.length === 1) return initialHits[0];
  if (!allowLastNameOnly) return null;
  const last = lastName(label);
  const lastHits = players.filter((player) => lastName(player.name) === last);
  if (last && lastHits.length === 1) return lastHits[0];
  return null;
}

function matchFixtures(fixtures: FixtureRow[], events: OddsApiEvent[]) {
  const matched: Array<{ fixture: FixtureRow; eventId: string }> = [];
  for (const fixture of fixtures) {
    let best: { event: OddsApiEvent; score: number } | null = null;
    for (const event of events) {
      if (event.id == null || !event.home || !event.away || !event.date) continue;
      const kickoffGap = Math.abs(new Date(fixture.date).getTime() - new Date(event.date).getTime());
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

function lastName(value: string) {
  const parts = normalize(value).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function lastNameInitialKey(value: string) {
  const parts = normalize(value).split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts[parts.length - 1]}:${parts[0]?.[0] ?? ""}`;
}

const STOP = new Set(["fc", "cf", "sc", "afc", "the", "of", "and", "de", "club"]);

function bookmakerIdFor(name: string) {
  const exact = BOOKMAKER_IDS[name];
  if (exact != null) return exact;
  const wanted = name.toLowerCase();
  for (const [book, id] of Object.entries(BOOKMAKER_IDS)) {
    if (book.toLowerCase() === wanted) return id;
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

async function replaceUpsertPrematch(
  supabase: ReturnType<typeof createIngestClient>,
  rows: OddsRow[],
) {
  const size = 50;
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await supabase.from("prematch_odds").upsert(
      rows.slice(index, index + size),
      { onConflict: "fixture_id,bookmaker_id" },
    );
    if (error) throw new Error(error.message);
  }
}

async function replaceUpsertLive(
  supabase: ReturnType<typeof createIngestClient>,
  rows: OddsRow[],
) {
  if (rows.length === 0) return;
  const liveRows = rows.map((row) => ({
    fixture_id: row.fixture_id,
    league_id: row.league_id,
    bookmaker_id: row.bookmaker_id,
    bookmaker_name: row.bookmaker_name,
    status: {},
    odds_data: row.odds_data,
    updated_at: row.updated_at,
  }));
  const size = 50;
  for (let index = 0; index < liveRows.length; index += size) {
    const { error } = await supabase.from("live_odds").upsert(
      liveRows.slice(index, index + size),
      { onConflict: "fixture_id,bookmaker_id" },
    );
    if (error) throw new Error(error.message);
  }
}

async function dropForeignBookmakers(
  supabase: ReturnType<typeof createIngestClient>,
  fixtureIds: number[],
) {
  const allowed = new Set(uniqueNumbers(Object.values(BOOKMAKER_IDS)));
  for (const table of ["prematch_odds", "live_odds"] as const) {
    for (let index = 0; index < fixtureIds.length; index += CHUNK) {
      const chunk = fixtureIds.slice(index, index + CHUNK);
      const { data, error } = await supabase
        .from(table)
        .select("fixture_id, bookmaker_id")
        .in("fixture_id", chunk);
      if (error) throw new Error(error.message);
      const extra = [...new Set(
        (data ?? [])
          .map((row) => Number(row.bookmaker_id))
          .filter((id) => Number.isInteger(id) && !allowed.has(id)),
      )];
      if (extra.length === 0) continue;
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .in("fixture_id", chunk)
        .in("bookmaker_id", extra);
      if (deleteError) throw new Error(deleteError.message);
    }
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0))];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return redactOddsApiIo(cause.message);
  try {
    return redactOddsApiIo(JSON.stringify(cause));
  } catch {
    return redactOddsApiIo(String(cause));
  }
}

main().catch((cause) => {
  console.error(errorMessage(cause));
  process.exitCode = 1;
});
