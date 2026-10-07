import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_MATCHES = 10;
const CARD_LINE = 5.5;
const FOUL_LINE = 1.8;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type FixtureRow = {
  id: number;
  kickoff_at: string | null;
  status: string | null;
  status_short: string | null;
  league_id: number;
  referee: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home: { name: string | null } | { name: string | null }[] | null;
  away: { name: string | null } | { name: string | null }[] | null;
  league: { name: string | null } | { name: string | null }[] | null;
};

type RefereeRow = { referee_name: string; matches_officiated: number; avg_yellow_cards: number | string };
type PlayerRow = { player_id: number; team_id: number | null; matches_played: number | null; avg_fouls_committed: number | string | null };

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ success: false, reason: "GET or POST only" }, 405);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ success: false, reason: "Missing Supabase credentials" }, 500);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const from = new Date().toISOString();
  const to = new Date(Date.now() + WINDOW_MS).toISOString();
  const fixtures: FixtureRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("id, kickoff_at, status, status_short, league_id, referee, home_team_id, away_team_id, home:teams!home_team_id(name), away:teams!away_team_id(name), league:leagues!league_id(name)")
      .gte("kickoff_at", from)
      .lt("kickoff_at", to)
      .order("kickoff_at")
      .range(start, start + 999);
    if (error) return json({ success: false, reason: error.message }, 500);
    const page = (data ?? []) as FixtureRow[];
    fixtures.push(...page);
    if (page.length < 1000) break;
  }

  const refereeNames = [...new Set(fixtures.map((fixture) => normalizeReferee(fixture.referee)).filter((name): name is string => name != null))];
  const teamIds = [...new Set(fixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter((id): id is number => id != null))];
  const referees = new Map<string, RefereeRow>();
  const players: PlayerRow[] = [];

  for (let index = 0; index < refereeNames.length; index += 150) {
    const { data, error } = await supabase
      .from("referee_summary")
      .select("referee_name, matches_officiated, avg_yellow_cards")
      .in("referee_name", refereeNames.slice(index, index + 150));
    if (error) return json({ success: false, reason: error.message }, 500);
    for (const row of (data ?? []) as RefereeRow[]) referees.set(row.referee_name, row);
  }
  for (let index = 0; index < teamIds.length; index += 150) {
    const { data, error } = await supabase
      .from("player_prop_summary")
      .select("player_id, team_id, matches_played, avg_fouls_committed")
      .in("team_id", teamIds.slice(index, index + 150));
    if (error) return json({ success: false, reason: error.message }, 500);
    players.push(...((data ?? []) as PlayerRow[]));
  }

  const byTeam = new Map<number, PlayerRow[]>();
  for (const player of players) {
    if (player.team_id == null || (player.matches_played ?? 0) < MIN_MATCHES) continue;
    if (Number(player.avg_fouls_committed) < FOUL_LINE) continue;
    const list = byTeam.get(player.team_id) ?? [];
    list.push(player);
    byTeam.set(player.team_id, list);
  }

  const payload = fixtures.map((fixture) => {
    const refereeName = normalizeReferee(fixture.referee);
    const referee = refereeName ? referees.get(refereeName) : undefined;
    const match: Record<string, unknown> = {
      id: fixture.id,
      kickoff_at: fixture.kickoff_at,
      status: fixture.status ?? fixture.status_short,
      league_id: fixture.league_id,
      league_name: one(fixture.league)?.name ?? null,
      home_team_id: fixture.home_team_id,
      home_team_name: one(fixture.home)?.name ?? null,
      away_team_id: fixture.away_team_id,
      away_team_name: one(fixture.away)?.name ?? null,
      referee: refereeName ?? fixture.referee,
      matches_officiated: referee?.matches_officiated ?? null,
      avg_yellow_cards: referee == null ? null : Number(referee.avg_yellow_cards),
    };
    const refereeReady = referee != null && referee.matches_officiated >= MIN_MATCHES && Number(referee.avg_yellow_cards) >= CARD_LINE;
    const candidates = [
      ...(fixture.home_team_id == null ? [] : byTeam.get(fixture.home_team_id) ?? []),
      ...(fixture.away_team_id == null ? [] : byTeam.get(fixture.away_team_id) ?? []),
    ].sort((left, right) => Number(right.avg_fouls_committed) - Number(left.avg_fouls_committed));
    const player = candidates[0];
    if (refereeReady && player) {
      match.high_conviction_card_edge = {
        active: true,
        player_id: player.player_id,
        player_fouls: Number(player.avg_fouls_committed),
        referee_cards: Number(referee.avg_yellow_cards),
      };
    }
    return match;
  });

  return json({ from, to, fixtures: payload }, 200);
});

function normalizeReferee(value: string | null) {
  const name = value?.split(",")[0]?.trim() ?? "";
  return name === "" ? null : name;
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
