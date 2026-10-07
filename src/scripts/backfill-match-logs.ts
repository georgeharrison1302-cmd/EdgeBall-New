/**
 * Rate-limited backfill of match logs + team sheets (7-stat player metrics).
 *
 * Populates:
 *   - fixture_player_statistics  (/fixtures/players)
 *   - fixture_statistics         (/fixtures/statistics)
 *
 * Player `statistics` JSONB keeps the API-Football nested block and adds:
 *   - flat aliases: sot, shots_total, tackles_total, fouls_won, fouls_committed,
 *     gk_saves, cards_total (non-colliding with nested shots/tackles/cards)
 *   - `micro` bag with the exact 7 keys: sot, shots, tackles, fouls_won,
 *     fouls_committed, gk_saves, cards

 *
 *   npm run backfill:logs
 *   npm run backfill:logs -- --league=39 --limit=50
 *   npm run backfill:logs:core   # priority leagues, 40 each
 *   npm run backfill:logs:rolling  # last 10 FT per team across TARGET_LEAGUE_IDS
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";

const FINISHED = ["FT", "AET", "PEN"] as const;
const DEFAULT_LIMIT = 50;
/** API-Football rate cushion between fixture calls. */
const SLEEP_MS = 300;
const API_BASE = "https://v3.football.api-sports.io";

/**
 * Fallback league list for --core when TARGET_LEAGUE_IDS is unavailable.
 * Prefer TARGET_LEAGUE_IDS for rolling coverage.
 */
const PRIORITY_LEAGUE_IDS = [39, 40, 140, 135, 78, 61, 2, 5] as const;

type Args = {
  leagueIds: number[];
  limit: number;
  perLeague: boolean;
  /** Team rolling history via /fixtures?team=&last= across target leagues */
  rolling: boolean;
  rollingDays: number;
  /** Look-back window (days) when collecting active teams per league. */
  rollingLookbackDays: number;
  lastPerTeam: number;
};

type ApiFixturesEnvelope = {
  response?: ApiFixtureItem[];
  errors?: unknown;
};

type ApiFixtureItem = {
  fixture?: {
    id?: number | null;
    date?: string | null;
    timestamp?: number | null;
    referee?: string | null;
    timezone?: string | null;
    venue?: { id?: number | null } | null;
    status?: { short?: string | null; long?: string | null; elapsed?: number | null } | null;
  } | null;
  league?: { id?: number | null; name?: string | null; logo?: string | null; season?: number | null } | null;
  teams?: {
    home?: { id?: number | null; name?: string | null; logo?: string | null } | null;
    away?: { id?: number | null; name?: string | null; logo?: string | null } | null;
  } | null;
  goals?: { home?: number | null; away?: number | null } | null;
  score?: unknown;
};

type TeamSheetRow = {
  fixture_id: number;
  team_id: number;
  statistics: Record<string, unknown>;
  updated_at: string;
};

type PlayerLogRow = {
  fixture_id: number;
  team_id: number;
  player_id: number;
  player_name: string | null;
  statistics: ApiPlayerStatBlock[];
  updated_at: string;
};

type ApiStatPair = {
  type?: string | null;
  value?: string | number | null;
};

type ApiTeamStatisticsItem = {
  team?: { id?: number | null; name?: string | null } | null;
  statistics?: ApiStatPair[] | null;
};

type ApiStatisticsEnvelope = {
  response?: ApiTeamStatisticsItem[];
  errors?: unknown;
};

type ApiPlayerStatBlock = {
  games?: {
    minutes?: number | null;
    number?: number | null;
    position?: string | null;
    rating?: string | null;
    captain?: boolean | null;
    substitute?: boolean | null;
  } | null;
  shots?: { total?: number | null; on?: number | null } | null;
  goals?: {
    total?: number | null;
    conceded?: number | null;
    assists?: number | null;
    saves?: number | null;
  } | null;
  passes?: {
    total?: number | null;
    key?: number | null;
    accuracy?: string | number | null;
  } | null;
  tackles?: {
    total?: number | null;
    blocks?: number | null;
    interceptions?: number | null;
  } | null;
  duels?: { total?: number | null; won?: number | null } | null;
  dribbles?: {
    attempts?: number | null;
    success?: number | null;
    past?: number | null;
  } | null;
  fouls?: { drawn?: number | null; committed?: number | null } | null;
  cards?: { yellow?: number | null; red?: number | null } | null;
  penalty?: Record<string, unknown> | null;
  /** Flat EdgeBall micro-stats (aliases — do not collide with nested groups). */
  sot?: number | null;
  shots_total?: number | null;
  tackles_total?: number | null;
  fouls_won?: number | null;
  fouls_committed?: number | null;
  gk_saves?: number | null;
  cards_total?: number | null;
  /** Exact 7-key bag (avoids clobbering nested shots/tackles/cards objects). */
  micro?: {
    sot: number | null;
    shots: number | null;
    tackles: number | null;
    fouls_won: number | null;
    fouls_committed: number | null;
    gk_saves: number | null;
    cards: number;
  };
  [key: string]: unknown;
};

type ApiPlayerEntry = {
  player?: {
    id?: number | null;
    name?: string | null;
    photo?: string | null;
  } | null;
  statistics?: ApiPlayerStatBlock[] | null;
};

type ApiPlayersTeamItem = {
  team?: { id?: number | null; name?: string | null; logo?: string | null } | null;
  players?: ApiPlayerEntry[] | null;
};

type ApiPlayersEnvelope = {
  response?: ApiPlayersTeamItem[];
  errors?: unknown;
};

async function main() {
  const apiKey = requireEnv("API_FOOTBALL_KEY");
  const supabase = createAdminClient();
  const args = parseArgs(process.argv.slice(2));

  if (args.rolling) {
    await runRollingTeamBackfill(apiKey, supabase, args);
    return;
  }

  const leaguePasses =
    args.leagueIds.length > 0
      ? args.leagueIds
      : args.perLeague
        ? [...PRIORITY_LEAGUE_IDS]
        : [...PRIORITY_LEAGUE_IDS];

  let ok = 0;
  let failed = 0;

  for (const leagueId of leaguePasses) {
    const targets = await targetFixtureIds(supabase, {
      leagueId,
      limit: args.limit,
    });
    console.log(
      `backfill-match-logs targets=${targets.length}` +
        (leagueId != null ? ` league=${leagueId}` : "") +
        ` limit=${args.limit}`,
    );

    if (targets.length === 0) continue;

    const result = await ingestFixtureIds(apiKey, supabase, targets, {
      label: leagueId != null ? `L${leagueId}` : "all",
    });
    ok += result.ok;
    failed += result.failed;
  }

  console.log(`backfill-match-logs done ok=${ok} failed=${failed}`);
}

/**
 * For every active team in TARGET_LEAGUE_IDS (or --leagues=), pull their last N
 * finished matches from API-Football and ingest player logs (cross-comp depth).
 */
async function runRollingTeamBackfill(
  apiKey: string,
  supabase: SupabaseClient,
  args: Args,
) {
  const leagues =
    args.leagueIds.length > 0 ? args.leagueIds : [...TARGET_LEAGUE_IDS];
  const teamIds = await activeTeamIdsForLeagues(supabase, leagues, {
    lookbackDays: args.rollingLookbackDays,
    aheadDays: args.rollingDays,
  });
  console.log(
    `backfill-match-logs rolling leagues=${leagues.length} teams=${teamIds.length}` +
      ` lookback=${args.rollingLookbackDays}d ahead=${args.rollingDays}d last=${args.lastPerTeam}`,
  );

  const fixtureIds = new Set<number>();
  for (const [index, teamId] of teamIds.entries()) {
    try {
      const envelope = await fetchJson<ApiFixturesEnvelope>(apiKey, "/fixtures", {
        team: teamId,
        last: args.lastPerTeam,
        status: "FT-AET-PEN",
      });
      await sleep(SLEEP_MS);

      const items = envelope.response ?? [];
      await upsertFixtureSkeleton(supabase, items);

      for (const item of items) {
        const id = item.fixture?.id;
        if (id != null && Number.isInteger(id) && id > 0) fixtureIds.add(Number(id));
      }
      console.log(
        `[team ${index + 1}/${teamIds.length}] id=${teamId} fixtures=${items.length}`,
      );
    } catch (cause) {
      console.log(`[✗] team ${teamId}: ${errorMessage(cause)}`);
    }
  }

  const candidates = [...fixtureIds];
  const missing = await filterMissingPlayerLogs(supabase, candidates);
  console.log(
    `backfill-match-logs rolling unique=${candidates.length} missing_logs=${missing.length}`,
  );

  const result = await ingestFixtureIds(apiKey, supabase, missing, { label: "rolling" });
  console.log(`backfill-match-logs rolling done ok=${result.ok} failed=${result.failed}`);
}

/**
 * Distinct teams appearing in fixtures for the given leagues across a lookback
 * + upcoming window (active clubs / national sides we actually track).
 */
async function activeTeamIdsForLeagues(
  supabase: SupabaseClient,
  leagueIds: number[],
  window: { lookbackDays: number; aheadDays: number },
): Promise<number[]> {
  if (leagueIds.length === 0) return [];
  const now = Date.now();
  const from = new Date(now - window.lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(now + window.aheadDays * 24 * 60 * 60 * 1000).toISOString();
  const ids = new Set<number>();

  for (let index = 0; index < leagueIds.length; index += 20) {
    const chunk = leagueIds.slice(index, index + 20);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("fixtures")
        .select("home_team_id, away_team_id")
        .in("league_id", chunk)
        .gte("date", from)
        .lt("date", until)
        .range(offset, offset + 999);
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        const home = Number(row.home_team_id);
        const away = Number(row.away_team_id);
        if (Number.isInteger(home) && home > 0) ids.add(home);
        if (Number.isInteger(away) && away > 0) ids.add(away);
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  }

  return [...ids].sort((a, b) => a - b);
}

async function filterMissingPlayerLogs(
  supabase: SupabaseClient,
  fixtureIds: number[],
): Promise<number[]> {
  if (fixtureIds.length === 0) return [];
  const already = new Set<number>();
  for (let index = 0; index < fixtureIds.length; index += 200) {
    const chunk = fixtureIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("fixture_player_statistics")
      .select("fixture_id")
      .in("fixture_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) already.add(Number(row.fixture_id));
  }
  return fixtureIds.filter((id) => !already.has(id));
}

async function upsertFixtureSkeleton(supabase: SupabaseClient, items: ApiFixtureItem[]) {
  const teams = new Map<number, { id: number; name: string; logo: string | null }>();
  const leagues = new Map<number, { id: number; name: string; logo: string | null }>();
  const fixtures: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const id = item.fixture?.id;
    if (id == null || !Number.isInteger(id) || id <= 0) continue;
    const leagueId = item.league?.id;
    if (leagueId != null && Number.isInteger(leagueId) && leagueId > 0) {
      leagues.set(leagueId, {
        id: leagueId,
        name: item.league?.name?.trim() || `League ${leagueId}`,
        logo: item.league?.logo ?? null,
      });
    }
    for (const side of [item.teams?.home, item.teams?.away]) {
      if (side?.id == null || !Number.isInteger(side.id) || side.id <= 0) continue;
      teams.set(side.id, {
        id: side.id,
        name: side.name ?? `Team ${side.id}`,
        logo: side.logo ?? null,
      });
    }
    fixtures.push({
      id,
      date: item.fixture?.date ?? null,
      timestamp: item.fixture?.timestamp ?? null,
      referee: item.fixture?.referee ?? null,
      timezone: item.fixture?.timezone ?? null,
      // Skip venue FK — rolling only needs fixture date + teams for FPS.
      venue_id: null,
      status_short: item.fixture?.status?.short ?? null,
      status_long: item.fixture?.status?.long ?? null,
      elapsed: item.fixture?.status?.elapsed ?? null,
      league_id: leagueId != null && Number.isInteger(leagueId) && leagueId > 0 ? leagueId : null,
      season: item.league?.season ?? null,
      home_team_id: item.teams?.home?.id ?? null,
      away_team_id: item.teams?.away?.id ?? null,
      home_goals: item.goals?.home ?? null,
      away_goals: item.goals?.away ?? null,
      score: item.score ?? null,
    });
  }

  if (leagues.size > 0) {
    const { error } = await supabase.from("leagues").upsert([...leagues.values()], {
      onConflict: "id",
    });
    if (error) throw error;
  }
  if (teams.size > 0) {
    const { error } = await supabase.from("teams").upsert([...teams.values()], {
      onConflict: "id",
    });
    if (error) throw error;
  }
  if (fixtures.length > 0) {
    const { error } = await supabase.from("fixtures").upsert(fixtures, { onConflict: "id" });
    if (error) throw error;
  }
}

async function ingestFixtureIds(
  apiKey: string,
  supabase: SupabaseClient,
  targets: number[],
  meta: { label: string },
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (const [index, fixtureId] of targets.entries()) {
    try {
      const playerEnvelope = await fetchJson<ApiPlayersEnvelope>(apiKey, "/fixtures/players", {
        fixture: fixtureId,
      });
      await sleep(SLEEP_MS);
      const statsEnvelope = await fetchJson<ApiStatisticsEnvelope>(
        apiKey,
        "/fixtures/statistics",
        { fixture: fixtureId },
      );

      const sheets = mapTeamSheets(fixtureId, statsEnvelope.response ?? []);
      const logs = mapPlayerLogs(fixtureId, playerEnvelope.response ?? []);

      if (sheets.length > 0) {
        const { error } = await supabase.from("fixture_statistics").upsert(sheets, {
          onConflict: "fixture_id,team_id",
        });
        if (error) throw error;
      }

      if (logs.length > 0) {
        const { error } = await supabase.from("fixture_player_statistics").upsert(logs, {
          onConflict: "fixture_id,team_id,player_id",
        });
        if (error) throw error;
      }

      ok += 1;
      console.log(
        `[✓] Fixture ${fixtureId}: Upserted ${sheets.length} team sheets and ${logs.length} player logs` +
          ` (${index + 1}/${targets.length} · ${meta.label})`,
      );
    } catch (cause) {
      failed += 1;
      console.log(
        `[✗] Fixture ${fixtureId}: ${errorMessage(cause)} (${index + 1}/${targets.length} · ${meta.label})`,
      );
    }

    await sleep(SLEEP_MS);
  }

  return { ok, failed };
}

async function targetFixtureIds(
  supabase: SupabaseClient,
  args: { leagueId: number | null; limit: number },
): Promise<number[]> {
  let query = supabase
    .from("fixtures")
    .select("id, date")
    .in("status_short", [...FINISHED])
    .order("date", { ascending: false })
    .limit(Math.max(args.limit * 8, 200));

  if (args.leagueId != null) {
    query = query.eq("league_id", args.leagueId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data ?? [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (candidates.length === 0) return [];

  const alreadyLogged = new Set<number>();
  for (let index = 0; index < candidates.length; index += 200) {
    const chunk = candidates.slice(index, index + 200);
    const { data: rows, error: logError } = await supabase
      .from("fixture_player_statistics")
      .select("fixture_id")
      .in("fixture_id", chunk);
    if (logError) throw logError;
    for (const row of rows ?? []) {
      alreadyLogged.add(Number(row.fixture_id));
    }
  }

  return candidates.filter((id) => !alreadyLogged.has(id)).slice(0, args.limit);
}

function mapTeamSheets(
  fixtureId: number,
  items: ApiTeamStatisticsItem[],
): TeamSheetRow[] {
  const updatedAt = new Date().toISOString();
  const rows: TeamSheetRow[] = [];

  for (const item of items) {
    const teamId = item.team?.id;
    if (teamId == null || !Number.isInteger(teamId) || teamId <= 0) continue;

    const statistics: Record<string, unknown> = {};
    for (const pair of item.statistics ?? []) {
      const type = typeof pair.type === "string" ? pair.type.trim() : "";
      if (!type) continue;
      statistics[type] = normalizeStatValue(type, pair.value);
    }

    rows.push({
      fixture_id: fixtureId,
      team_id: teamId,
      statistics,
      updated_at: updatedAt,
    });
  }

  return rows;
}

function mapPlayerLogs(
  fixtureId: number,
  items: ApiPlayersTeamItem[],
): PlayerLogRow[] {
  const updatedAt = new Date().toISOString();
  const rows: PlayerLogRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const teamId = item.team?.id;
    if (teamId == null || !Number.isInteger(teamId) || teamId <= 0) continue;

    for (const entry of item.players ?? []) {
      const playerId = entry.player?.id;
      if (playerId == null || !Number.isInteger(playerId) || playerId <= 0) continue;

      const blocks = Array.isArray(entry.statistics) ? entry.statistics : [];
      const primary = blocks[0];
      const minutes = primary?.games?.minutes;
      if (minutes == null || minutes === 0) continue;

      const key = `${teamId}:${playerId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const enriched = blocks.map((block, index) =>
        index === 0 ? withSevenStatAliases(block) : block,
      );

      rows.push({
        fixture_id: fixtureId,
        team_id: teamId,
        player_id: playerId,
        player_name: entry.player?.name ?? null,
        statistics: enriched,
        updated_at: updatedAt,
      });
    }
  }

  return rows;
}

/**
 * Map the 7 core betting micro-stats onto the primary statistics block.
 * Nested API-Football objects are preserved for existing consumers.
 */
/**
 * Map the 7 core betting micro-stats onto the primary statistics block.
 * Nested API-Football objects (shots / tackles / cards / …) are preserved.
 */
function withSevenStatAliases(block: ApiPlayerStatBlock): ApiPlayerStatBlock {
  const yellow = asFinite(block.cards?.yellow) ?? 0;
  const red = asFinite(block.cards?.red) ?? 0;
  const sot = asFinite(block.shots?.on);
  const shots = asFinite(block.shots?.total);
  const tackles = asFinite(block.tackles?.total);
  const fouls_won = asFinite(block.fouls?.drawn);
  const fouls_committed = asFinite(block.fouls?.committed);
  const gk_saves = asFinite(block.goals?.saves);
  const cards = yellow + red;
  return {
    ...block,
    // Keep nested groups intact (do not overwrite with scalars).
    shots: block.shots,
    tackles: block.tackles,
    cards: block.cards,
    // Non-colliding flat aliases for existing readers
    sot,
    shots_total: shots,
    tackles_total: tackles,
    fouls_won,
    fouls_committed,
    gk_saves,
    cards_total: cards,
    // Exact 7-key map requested by Prop Desk / backfill contract
    micro: {
      sot,
      shots,
      tackles,
      fouls_won,
      fouls_committed,
      gk_saves,
      cards,
    },
  };
}

function asFinite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeStatValue(type: string, value: string | number | null | undefined): unknown {
  if (value == null) return null;
  const isPossession = /possession/i.test(type);
  if (isPossession) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const match = String(value).match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }
  if (typeof value === "number") return value;
  const asNum = Number(value);
  if (String(value).trim() !== "" && Number.isFinite(asNum) && !String(value).includes("%")) {
    return asNum;
  }
  return value;
}

async function fetchJson<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
  });

  if (response.status === 429) {
    throw new Error("API-Football 429 rate limited");
  }
  if (!response.ok) {
    throw new Error(`API-Football ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}

function parseArgs(argv: string[]): Args {
  const leagueIds: number[] = [];
  let limit = DEFAULT_LIMIT;
  let perLeague = false;
  let rolling = false;
  let rollingDays = 7;
  let rollingLookbackDays = 60;
  let lastPerTeam = 10;
  for (const arg of argv) {
    if (arg === "--core") {
      perLeague = true;
      continue;
    }
    if (arg === "--rolling") {
      rolling = true;
      continue;
    }
    const league = arg.match(/^--league=(\d+)$/);
    if (league) leagueIds.push(Number(league[1]));
    const leagues = arg.match(/^--leagues=([\d,]+)$/);
    if (leagues) {
      for (const part of leagues[1]!.split(",")) {
        const id = Number(part.trim());
        if (Number.isInteger(id) && id > 0) leagueIds.push(id);
      }
    }
    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch) limit = Math.max(1, Number(limitMatch[1]));
    const daysMatch = arg.match(/^--days=(\d+)$/);
    if (daysMatch) rollingDays = Math.max(1, Number(daysMatch[1]));
    const lookbackMatch = arg.match(/^--lookback=(\d+)$/);
    if (lookbackMatch) rollingLookbackDays = Math.max(1, Number(lookbackMatch[1]));
    const lastMatch = arg.match(/^--last=(\d+)$/);
    if (lastMatch) lastPerTeam = Math.max(1, Math.min(30, Number(lastMatch[1])));
  }
  return {
    leagueIds: [...new Set(leagueIds)],
    limit,
    perLeague,
    rolling,
    rollingDays,
    rollingLookbackDays,
    lastPerTeam,
  };
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return String(cause);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
