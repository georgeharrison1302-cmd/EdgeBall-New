/**
 * Poisson card-edge engine for stored Odds-API.io player booking markets.
 *
 *   npm run calc:edges
 *
 * Reads prematch_odds (Player Cards / Player to be Booked), computes
 *   lambda = playerBaseRate * refModifier * opponentModifier
 *   modelProb = 1 - exp(-lambda)
 *   edgePct = ((bookieDecimalOdds * modelProb) - 1) * 100
 * and writes model_prob / edge_pct onto each card value in odds_data plus
 * the same two numeric columns on the prematch_odds row (best edge among
 * card outcomes on that bookmaker snapshot).
 *
 * Missing referee or opponent context defaults that modifier to 1.0.
 * Player card rates come from player_season_stats (player_profiles has
 * identity only — no cards/apps columns on PYTH).
 *
 * SQL already applied on PYTH; same snippet lives in
 * supabase/migrations/20261004194246_prematch_odds_model_edge.sql
 *
 *   ALTER TABLE public.prematch_odds
 *     ADD COLUMN IF NOT EXISTS model_prob numeric,
 *     ADD COLUMN IF NOT EXISTS edge_pct numeric;
 */
import { normalizeReferee } from "@/utils/stats/referee-name";
import { createIngestClient } from "@/utils/supabase/admin";
import { asNumber, asRecord, isMissingRelation, nestNumber } from "@/utils/pyth";

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"] as const;
const MIN_PLAYER_MATCHES = 5;
const MIN_REF_MATCHES = 3;
/** Booking tips above this price are Poisson tail noise, not edge. */
const CARD_ODDS_CAP = 4.5;
/** A booking edge above this is almost always a rate/sample artefact. */
const CARD_EDGE_CAP_PCT = 40;

const PAGE = 1000;
const IN_CHUNK = 200;
const UPSERT_CHUNK = 100;
const CARD_MARKETS = new Set([
  "player cards",
  "player to be booked",
  "player props - cards",
]);

type Ingest = ReturnType<typeof createIngestClient>;

type OddsRow = {
  fixture_id: number;
  league_id: number | null;
  season: number | null;
  bookmaker_id: number;
  bookmaker_name: string | null;
  odds_data: unknown;
  updated_at: string | null;
};

type BetValue = {
  value?: string | number | null;
  odd?: string | number | null;
  player_id?: number | null;
  label?: string | null;
  model_prob?: number;
  edge_pct?: number;
};

type Bet = {
  id?: number | null;
  name?: string | null;
  values?: BetValue[] | null;
};

type OddsData = {
  id?: number;
  name?: string;
  bets?: Bet[];
};

type FixtureCtx = {
  id: number;
  league_id: number;
  season: number;
  referee: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
};

type PlayerRate = {
  cards: number;
  matches: number;
  rate: number;
};

type PlayerRateIndex = {
  exact: Map<string, PlayerRate>;
  any: Map<number, PlayerRate>;
};

async function main() {
  const supabase = createIngestClient();
  const rows = await loadCardOddsRows(supabase);
  console.log(`calc-edges card snapshots ${rows.length}`);
  if (rows.length === 0) {
    console.log("calc-edges done priced=0 skipped=0");
    return;
  }

  const fixtureIds = uniqueInts(rows.map((row) => row.fixture_id));
  const fixtures = await loadFixtures(supabase, fixtureIds);
  console.log(`calc-edges fixtures ${fixtures.size}`);

  const playerIds = uniqueInts(
    rows.flatMap((row) => cardValues(row.odds_data).map((value) => Number(value.player_id))),
  );
  const teamIds = uniqueInts(
    [...fixtures.values()].flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]),
  );

  const [playerTeam, playerRates, refRates, teamFouls, startersByFixture] = await Promise.all([
    loadPlayerTeams(supabase, playerIds, teamIds),
    loadPlayerRates(supabase, playerIds, fixtures),
    loadRefereeAverages(supabase, [...fixtures.values()]),
    loadTeamFoulsDrawn(supabase, teamIds, [...fixtures.values()]),
    loadStarters(supabase, fixtureIds),
  ]);
  const leagueFouls = leagueFoulAverages(teamFouls, [...fixtures.values()]);

  let priced = 0;
  let skipped = 0;
  const updates: OddsRow[] = [];

  for (const row of rows) {
    const fixture = fixtures.get(row.fixture_id);
    const patched = patchRow(
      row,
      fixture,
      playerTeam,
      playerRates,
      refRates.refAvg,
      refRates.leagueAvg,
      teamFouls,
      leagueFouls,
      startersByFixture.get(row.fixture_id),
    );
    priced += patched.priced;
    skipped += patched.skipped;
    updates.push(patched.row);
  }

  await writeUpdates(supabase, updates);
  console.log(`calc-edges done priced=${priced} skipped=${skipped} rows=${updates.length}`);
}

async function loadCardOddsRows(supabase: Ingest) {
  const rows: OddsRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("prematch_odds")
      .select("fixture_id, league_id, season, bookmaker_id, bookmaker_name, odds_data, updated_at")
      .order("fixture_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as OddsRow[];
    rows.push(...page.filter((row) => cardBets(row.odds_data).length > 0));
    if (page.length < PAGE) break;
  }
  return rows;
}

async function loadFixtures(supabase: Ingest, fixtureIds: number[]) {
  const map = new Map<number, FixtureCtx>();
  for (const chunk of chunks(fixtureIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, league_id, season, referee, home_team_id, away_team_id")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = Number(row.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      map.set(id, {
        id,
        league_id: Number(row.league_id) || 0,
        season: Number(row.season) || 0,
        referee: typeof row.referee === "string" && row.referee.trim() ? row.referee.trim() : null,
        home_team_id: Number(row.home_team_id) || null,
        away_team_id: Number(row.away_team_id) || null,
      });
    }
  }
  return map;
}

async function loadPlayerTeams(supabase: Ingest, playerIds: number[], teamIds: number[]) {
  const map = new Map<number, number>();
  if (playerIds.length === 0 || teamIds.length === 0) return map;
  for (const chunk of chunks(teamIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("team_squads")
      .select("player_id, team_id")
      .in("team_id", chunk);
    if (error) throw error;
    const wanted = new Set(playerIds);
    for (const row of data ?? []) {
      const playerId = Number(row.player_id);
      const teamId = Number(row.team_id);
      if (!wanted.has(playerId) || !Number.isInteger(teamId) || teamId <= 0) continue;
      map.set(playerId, teamId);
    }
  }
  return map;
}

/**
 * PYTH player_profiles has no cards/apps columns. Rates come from
 * player_season_stats; profiles are still loaded so missing players are known.
 */
async function loadPlayerRates(
  supabase: Ingest,
  playerIds: number[],
  _fixtures: Map<number, FixtureCtx>,
): Promise<PlayerRateIndex> {
  const exact = new Map<string, PlayerRate>();
  const aggregate = new Map<number, { cards: number; matches: number }>();
  if (playerIds.length === 0) return { exact, any: new Map() };

  for (const chunk of chunks(playerIds, IN_CHUNK)) {
    const { error: profileError } = await supabase
      .from("player_profiles")
      .select("player_id")
      .in("player_id", chunk);
    if (profileError && !isMissingRelation(profileError)) throw profileError;

    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, league_id, season, appearances, yellow_cards, red_cards")
      .in("player_id", chunk);
    if (error) throw error;

    for (const row of data ?? []) {
      const playerId = Number(row.player_id);
      const matches = Number(row.appearances) || 0;
      if (!Number.isInteger(playerId) || matches <= 0) continue;
      const cards = (Number(row.yellow_cards) || 0) + (Number(row.red_cards) || 0);
      const rate = { cards, matches, rate: cards / matches };
      exact.set(`${playerId}:${Number(row.league_id)}:${Number(row.season)}`, rate);
      const agg = aggregate.get(playerId) ?? { cards: 0, matches: 0 };
      agg.cards += cards;
      agg.matches += matches;
      aggregate.set(playerId, agg);
    }
  }

  const any = new Map<number, PlayerRate>();
  for (const [playerId, agg] of aggregate) {
    if (agg.matches > 0) any.set(playerId, { cards: agg.cards, matches: agg.matches, rate: agg.cards / agg.matches });
  }
  return { exact, any };
}

function playerRateFor(index: PlayerRateIndex, playerId: number, fixture: FixtureCtx | undefined) {
  if (fixture) {
    const exact = index.exact.get(`${playerId}:${fixture.league_id}:${fixture.season}`);
    if (exact) return exact;
  }
  return index.any.get(playerId) ?? null;
}

/**
 * Per-match card rates by referee and by league:season, computed from
 * fixtures + fixture_statistics. The referee_stats table is not populated
 * on hosted Supabase, so we aggregate the same inputs the refresh
 * function would use. Units are match totals (both teams), keeping
 * refereeModifier() on the same scale as leagueRefAvg.
 */
/**
 * Confirmed starting XIs per fixture from fixture_lineups (synced ~90min
 * before kickoff). A fixture with no lineup rows is absent from the map,
 * which suppresses card tips for the whole fixture pre-lineup.
 */
async function loadStarters(supabase: Ingest, fixtureIds: number[]) {
  const map = new Map<number, Set<number>>();
  for (const chunk of chunks(fixtureIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("fixture_lineups")
      .select("fixture_id, start_xi")
      .in("fixture_id", chunk);
    if (error) {
      if (isMissingRelation(error)) return map;
      throw error;
    }
    for (const row of data ?? []) {
      const fixtureId = Number(row.fixture_id);
      const xi = Array.isArray(row.start_xi) ? row.start_xi : [];
      const set = map.get(fixtureId) ?? new Set<number>();
      for (const entry of xi) {
        const playerId = Number(asRecord(entry)?.player != null ? asRecord(asRecord(entry)?.player)?.id : null);
        if (Number.isInteger(playerId) && playerId > 0) set.add(playerId);
      }
      map.set(fixtureId, set);
    }
  }
  return map;
}

async function loadRefereeAverages(
  supabase: Ingest,
  fixtures: FixtureCtx[],
): Promise<{ refAvg: Map<string, number>; leagueAvg: Map<string, number> }> {
  const refAvg = new Map<string, number>();
  const leagueAvg = new Map<string, number>();
  const leagueIds = uniqueInts(fixtures.map((fixture) => fixture.league_id));
  const seasons = uniqueInts(fixtures.map((fixture) => fixture.season));
  if (leagueIds.length === 0 || seasons.length === 0) return { refAvg, leagueAvg };

  const pool: { id: number; referee: string; league: string }[] = [];
  for (const leagueChunk of chunks(leagueIds, IN_CHUNK)) {
    for (const seasonChunk of chunks(seasons, 10)) {
      const { data, error } = await supabase
        .from("fixtures")
        .select("id, referee, league_id, season")
        .not("referee", "is", null)
        .in("league_id", leagueChunk)
        .in("season", seasonChunk)
        .in("status_short", [...FINISHED])
        .limit(3000);
      if (error) throw error;
      for (const row of data ?? []) {
        const name = normalizeReferee(row.referee);
        if (!name) continue;
        pool.push({
          id: Number(row.id),
          referee: name,
          league: `${Number(row.league_id)}:${Number(row.season)}`,
        });
      }
    }
  }
  if (pool.length === 0) return { refAvg, leagueAvg };

  const yellowsByFixture = new Map<number, number>();
  const ids = pool.map((row) => row.id);
  for (const chunk of chunks(ids, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("fixture_statistics")
      .select("fixture_id, statistics")
      .in("fixture_id", chunk);
    if (error) {
      if (isMissingRelation(error)) return { refAvg, leagueAvg };
      throw error;
    }
    for (const row of data ?? []) {
      const stats = asRecord(row.statistics);
      const yellows =
        asNumber(stats?.["Yellow Cards"]) ?? asNumber(stats?.["yellow cards"]);
      if (yellows == null) continue;
      const fixtureId = Number(row.fixture_id);
      yellowsByFixture.set(fixtureId, (yellowsByFixture.get(fixtureId) ?? 0) + yellows);
    }
  }

  const refBuckets = new Map<string, { sum: number; n: number }>();
  const leagueBuckets = new Map<string, { sum: number; n: number }>();
  for (const row of pool) {
    const yellows = yellowsByFixture.get(row.id);
    if (yellows == null) continue;
    const ref = refBuckets.get(row.referee.toLowerCase()) ?? { sum: 0, n: 0 };
    ref.sum += yellows;
    ref.n += 1;
    refBuckets.set(row.referee.toLowerCase(), ref);
    const league = leagueBuckets.get(row.league) ?? { sum: 0, n: 0 };
    league.sum += yellows;
    league.n += 1;
    leagueBuckets.set(row.league, league);
  }
  for (const [key, bucket] of refBuckets) {
    if (bucket.n >= MIN_REF_MATCHES) refAvg.set(key, bucket.sum / bucket.n);
  }
  for (const [key, bucket] of leagueBuckets) {
    if (bucket.n > 0) leagueAvg.set(key, bucket.sum / bucket.n);
  }
  return { refAvg, leagueAvg };
}

async function loadTeamFoulsDrawn(supabase: Ingest, teamIds: number[], fixtures: FixtureCtx[]) {
  const map = new Map<string, number>();
  if (teamIds.length === 0) return map;
  const seasons = uniqueInts(fixtures.map((fixture) => fixture.season));
  const leagueIds = uniqueInts(fixtures.map((fixture) => fixture.league_id));

  for (const chunk of chunks(teamIds, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("team_statistics")
      .select("team_id, league_id, season, stats")
      .in("team_id", chunk)
      .in("league_id", leagueIds)
      .in("season", seasons);
    if (error) throw error;
    for (const row of data ?? []) {
      const perGame = foulsDrawnPerGame(row.stats);
      if (perGame == null) continue;
      map.set(`${Number(row.team_id)}:${Number(row.league_id)}:${Number(row.season)}`, perGame);
    }
  }
  return map;
}

function foulsDrawnPerGame(stats: unknown) {
  const played = nestNumber(stats, "fixtures", "played", "total");
  const drawn =
    nestNumber(stats, "fouls", "drawn", "total") ??
    nestNumber(stats, "fouls", "drawn") ??
    nestNumber(stats, "fouls", "drawn", "home");
  if (drawn == null || played == null || played <= 0) return null;
  return drawn / played;
}

function leagueFoulAverages(teamFouls: Map<string, number>, fixtures: FixtureCtx[]) {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const fixture of fixtures) {
    const leagueKey = leagueSeasonKey(fixture);
    for (const teamId of [fixture.home_team_id, fixture.away_team_id]) {
      if (!teamId) continue;
      const perGame = teamFouls.get(`${teamId}:${fixture.league_id}:${fixture.season}`);
      if (perGame == null) continue;
      const bucket = buckets.get(leagueKey) ?? { sum: 0, n: 0 };
      bucket.sum += perGame;
      bucket.n += 1;
      buckets.set(leagueKey, bucket);
    }
  }
  const map = new Map<string, number>();
  for (const [key, bucket] of buckets) {
    if (bucket.n > 0) map.set(key, bucket.sum / bucket.n);
  }
  return map;
}

function patchRow(
  row: OddsRow,
  fixture: FixtureCtx | undefined,
  playerTeam: Map<number, number>,
  playerRates: PlayerRateIndex,
  refAvg: Map<string, number>,
  leagueRefAvg: Map<string, number>,
  teamFouls: Map<string, number>,
  leagueFouls: Map<string, number>,
  starters: Set<number> | undefined,
) {
  const data = cloneOddsData(row.odds_data);
  const bets = data.bets ?? [];
  let priced = 0;
  let skipped = 0;
  let bestEdge = Number.NEGATIVE_INFINITY;
  let bestProb: number | null = null;

  const refModifier = refereeModifier(fixture, refAvg, leagueRefAvg);

  for (const bet of bets) {
    if (!isCardMarket(bet.name)) continue;
    const values = Array.isArray(bet.values) ? bet.values : [];
    for (const value of values) {
      const playerId = Number(value.player_id);
      const odd = Number(value.odd);
      const suppress = (reason?: never) => {
        delete value.model_prob;
        delete value.edge_pct;
        skipped += 1;
        void reason;
      };
      if (!Number.isInteger(playerId) || playerId <= 0 || !Number.isFinite(odd) || odd <= 1) {
        suppress();
        continue;
      }
      // Lineup gate: card tips only exist for confirmed starters.
      if (starters == null || !starters.has(playerId)) {
        suppress();
        continue;
      }
      // Tail guardrail: extreme longshot booking prices are tail noise.
      if (odd > CARD_ODDS_CAP) {
        suppress();
        continue;
      }
      const rate = playerRateFor(playerRates, playerId, fixture);
      if (!rate || rate.matches < MIN_PLAYER_MATCHES) {
        suppress();
        continue;
      }
      const opponentModifier = opponentFoulModifier(
        fixture,
        playerTeam.get(playerId) ?? null,
        teamFouls,
        leagueFouls,
      );
      const lambda = rate.rate * refModifier * opponentModifier;
      const modelProb = 1 - Math.exp(-lambda);
      const edgePct = (odd * modelProb - 1) * 100;
      if (edgePct > CARD_EDGE_CAP_PCT) {
        suppress();
        continue;
      }
      value.model_prob = round(modelProb, 6);
      value.edge_pct = round(edgePct, 2);
      priced += 1;
      if (edgePct > bestEdge) {
        bestEdge = edgePct;
        bestProb = modelProb;
      }
    }
  }

  return {
    priced,
    skipped,
    row: {
      ...row,
      odds_data: data,
      model_prob: bestProb == null ? null : round(bestProb, 6),
      edge_pct: bestProb == null ? null : round(bestEdge, 2),
    } as OddsRow & { model_prob: number | null; edge_pct: number | null },
  };
}

function refereeModifier(
  fixture: FixtureCtx | undefined,
  refAvg: Map<string, number>,
  leagueRefAvg: Map<string, number>,
) {
  if (!fixture?.referee) return 1;
  const name = normalizeReferee(fixture.referee);
  if (!name) return 1;
  const ref = refAvg.get(name.toLowerCase());
  const league = leagueRefAvg.get(leagueSeasonKey(fixture));
  if (ref == null || league == null || league <= 0) return 1;
  // Clamp so one outlier referee cannot explode the edge estimate.
  return Math.min(1.6, Math.max(0.6, ref / league));
}

function opponentFoulModifier(
  fixture: FixtureCtx | undefined,
  playerTeamId: number | null,
  teamFouls: Map<string, number>,
  leagueFouls: Map<string, number>,
) {
  if (!fixture || playerTeamId == null) return 1;
  const opponentId =
    playerTeamId === fixture.home_team_id
      ? fixture.away_team_id
      : playerTeamId === fixture.away_team_id
        ? fixture.home_team_id
        : null;
  if (!opponentId) return 1;
  const opp = teamFouls.get(`${opponentId}:${fixture.league_id}:${fixture.season}`);
  const league = leagueFouls.get(leagueSeasonKey(fixture));
  if (opp == null || league == null || league <= 0) return 1;
  return Math.min(1.6, Math.max(0.6, opp / league));
}

async function writeUpdates(
  supabase: Ingest,
  rows: Array<OddsRow & { model_prob?: number | null; edge_pct?: number | null }>,
) {
  for (const slice of chunks(rows, UPSERT_CHUNK)) {
    const payload = slice.map((row) => ({
      fixture_id: row.fixture_id,
      league_id: row.league_id,
      season: row.season,
      bookmaker_id: row.bookmaker_id,
      bookmaker_name: row.bookmaker_name,
      odds_data: row.odds_data,
      updated_at: row.updated_at ?? new Date().toISOString(),
      model_prob: row.model_prob ?? null,
      edge_pct: row.edge_pct ?? null,
    }));
    const { error } = await supabase.from("prematch_odds").upsert(payload, {
      onConflict: "fixture_id,bookmaker_id",
    });
    if (error) throw error;
  }
}

function cardBets(oddsData: unknown) {
  const data = asRecord(oddsData);
  const bets = Array.isArray(data?.bets) ? (data.bets as Bet[]) : [];
  return bets.filter((bet) => isCardMarket(bet.name));
}

function cardValues(oddsData: unknown) {
  return cardBets(oddsData).flatMap((bet) => (Array.isArray(bet.values) ? bet.values : []));
}

function isCardMarket(name: unknown) {
  return CARD_MARKETS.has(String(name ?? "").trim().toLowerCase());
}

function cloneOddsData(oddsData: unknown): OddsData {
  const data = asRecord(oddsData);
  if (!data) return { bets: [] };
  return JSON.parse(JSON.stringify(data)) as OddsData;
}

function leagueSeasonKey(fixture: { league_id: number; season: number }) {
  return `${fixture.league_id}:${fixture.season}`;
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function uniqueInts(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => Number.isInteger(value) && (value as number) > 0))];
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
