import { nestNumber } from "@/utils/pyth";
import { safeEqual } from "@/utils/api/cron-auth";
import { loadRefereeRates, normalizeReferee } from "@/utils/stats/referees";
import { createIngestClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const MIN_MATCHES = 10;
const CARD_LINE = 5.5;
const FOUL_LINE = 1.8;
const SOT_MIN_APPS = 10;
const SOT_PER_GAME = 0.75;

type FeedRow = {
  id: number;
  kickoff_at: string | null;
  status: string | null;
  league_id: number;
  league_name: string | null;
  home_team_id: number | null;
  home_team_name: string | null;
  away_team_id: number | null;
  away_team_name: string | null;
  referee: string | null;
  referee_name: string | null;
  matches_officiated: number | null;
  avg_yellow_cards: number | string | null;
  avg_red_cards: number | string | null;
  avg_fouls: number | string | null;
  home_rest_hours: number | string | null;
  away_rest_hours: number | string | null;
  fatigue_edge: boolean | null;
  disadvantaged_team: string | null;
};

async function authorizeUpcoming(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const headerSecret = request.headers.get("x-cron-secret");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const provided = bearer ?? headerSecret;
    if (provided && safeEqual(provided, secret)) return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const denied = await authorizeUpcoming(request);
  if (denied) return denied;

  const supabase = createIngestClient();
  const rows: FeedRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("upcoming_fixtures_feed").range(from, from + 999);
    if (error) {
      return NextResponse.json({ success: false, reason: error.message }, { status: 500 });
    }
    const page = (data ?? []) as FeedRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  let edgesByFixture = new Map<number, Array<Record<string, unknown>>>();
  try {
    edgesByFixture = await seasonPropEdges(rows);
  } catch {
    edgesByFixture = new Map();
  }
  const convictionByFixture = await highConviction(rows);

  const fixtures = rows.map((row) => {
    const matches = row.matches_officiated;
    const avgYellows = row.avg_yellow_cards == null ? null : Number(row.avg_yellow_cards);
    const fixture: Record<string, unknown> = {
      id: row.id,
      // Feed may still label kickoff as kickoff_at; live fixtures column is `date`.
      kickoff_at: row.kickoff_at,
      date: row.kickoff_at,
      status: row.status,
      league_id: row.league_id,
      league_name: row.league_name,
      home_team_id: row.home_team_id,
      home_team_name: row.home_team_name,
      away_team_id: row.away_team_id,
      away_team_name: row.away_team_name,
      referee: row.referee_name ?? row.referee,
      matches_officiated: matches,
      avg_yellow_cards: avgYellows,
      avg_red_cards: row.avg_red_cards == null ? null : Number(row.avg_red_cards),
      avg_fouls: row.avg_fouls == null ? null : Number(row.avg_fouls),
      home_rest_hours: row.home_rest_hours == null ? null : Number(row.home_rest_hours),
      away_rest_hours: row.away_rest_hours == null ? null : Number(row.away_rest_hours),
    };
    if (matches != null && matches >= MIN_MATCHES && avgYellows != null && avgYellows >= CARD_LINE) {
      const name = row.referee_name ?? row.referee ?? "Unknown";
      fixture.card_edge = true;
      fixture.betting_insights = {
        edge_found: true,
        market: "Over 4.5 Cards",
        reason: `Referee ${name} averages ${avgYellows.toFixed(2)} yellow cards per match.`,
      };
    }
    if (row.fatigue_edge === true && (row.disadvantaged_team === "Home" || row.disadvantaged_team === "Away")) {
      fixture.fatigue_edge = true;
      fixture.disadvantaged_team = row.disadvantaged_team;
      fixture.reason = "72h rest deficit";
    }
    const edges = edgesByFixture.get(row.id) ?? [];
    if (edges.length > 0) fixture.prop_edge = edges;
    const conviction = convictionByFixture.get(row.id);
    if (conviction) fixture.high_conviction_card_edge = conviction;
    return fixture;
  });

  const from = new Date().toISOString();
  const to = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  return NextResponse.json({ from, to, fixtures });
}

type SeasonFoul = {
  player_id: number;
  team_id: number;
  matches_played: number;
  avg_fouls_committed: number;
  sot_per_game: number | null;
  name: string | null;
};

async function loadSeasonLeaders(teamIds: number[]): Promise<SeasonFoul[]> {
  if (teamIds.length === 0) return [];
  const supabase = createIngestClient();
  const rows: SeasonFoul[] = [];
  for (let index = 0; index < teamIds.length; index += 150) {
    const chunk = teamIds.slice(index, index + 150);
    const { data, error } = await supabase
      .from("player_season_stats")
      .select("player_id, team_id, appearances, stats_data")
      .in("team_id", chunk)
      .gte("appearances", MIN_MATCHES);
    if (error) throw error;
    for (const row of data ?? []) {
      const apps = Number(row.appearances);
      if (!Number.isFinite(apps) || apps < MIN_MATCHES) continue;
      const fouls = nestNumber(row.stats_data, "fouls", "committed");
      const sot = nestNumber(row.stats_data, "shots", "on");
      const avgFouls = fouls == null ? null : fouls / apps;
      const sotPerGame = sot == null ? null : sot / apps;
      if ((avgFouls == null || avgFouls < FOUL_LINE) && (sotPerGame == null || sotPerGame < SOT_PER_GAME)) {
        continue;
      }
      rows.push({
        player_id: Number(row.player_id),
        team_id: Number(row.team_id),
        matches_played: apps,
        avg_fouls_committed: avgFouls ?? 0,
        sot_per_game: sotPerGame,
        name: null,
      });
    }
  }
  return rows;
}

async function seasonPropEdges(rows: FeedRow[]) {
  const edges = new Map<number, Array<Record<string, unknown>>>();
  const teamIds = [
    ...new Set(
      rows.flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null),
    ),
  ];
  const leaders = (await loadSeasonLeaders(teamIds)).filter(
    (row) =>
      row.sot_per_game != null &&
      row.sot_per_game >= SOT_PER_GAME &&
      row.matches_played >= SOT_MIN_APPS,
  );
  const byTeam = new Map<number, SeasonFoul[]>();
  for (const row of leaders) {
    const list = byTeam.get(row.team_id) ?? [];
    list.push(row);
    byTeam.set(row.team_id, list);
  }
  for (const row of rows) {
    const alerts = [
      ...(row.home_team_id == null ? [] : byTeam.get(row.home_team_id) ?? []).map((stat) => ({
        player_id: stat.player_id,
        player_name: `Player ${stat.player_id}`,
        team_id: stat.team_id,
        side: "Home",
        matches_played: stat.matches_played,
        avg_shots_on_target: Number((stat.sot_per_game ?? 0).toFixed(2)),
        source: "player_season_stats",
      })),
      ...(row.away_team_id == null ? [] : byTeam.get(row.away_team_id) ?? []).map((stat) => ({
        player_id: stat.player_id,
        player_name: `Player ${stat.player_id}`,
        team_id: stat.team_id,
        side: "Away",
        matches_played: stat.matches_played,
        avg_shots_on_target: Number((stat.sot_per_game ?? 0).toFixed(2)),
        source: "player_season_stats",
      })),
    ];
    if (alerts.length > 0) edges.set(row.id, alerts);
  }
  return edges;
}

async function highConviction(rows: FeedRow[]) {
  const alerts = new Map<number, Record<string, unknown>>();
  const names = [
    ...new Set(
      rows.map((row) => normalizeReferee(row.referee)).filter((name): name is string => name != null),
    ),
  ];
  const teamIds = [
    ...new Set(
      rows.flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null),
    ),
  ];
  const [referees, players] = await Promise.all([
    loadRefereeRates(names),
    loadSeasonLeaders(teamIds),
  ]);
  const foulLeaders = players.filter((row) => row.avg_fouls_committed >= FOUL_LINE);
  const byTeam = new Map<number, SeasonFoul[]>();
  for (const player of foulLeaders) {
    const list = byTeam.get(player.team_id) ?? [];
    list.push(player);
    byTeam.set(player.team_id, list);
  }

  for (const row of rows) {
    const refereeName = normalizeReferee(row.referee);
    const referee = refereeName ? referees.get(refereeName.toLowerCase()) : undefined;
    if (!referee || referee.matches < MIN_MATCHES || referee.avg < CARD_LINE) continue;
    const candidates = [
      ...(row.home_team_id == null ? [] : byTeam.get(row.home_team_id) ?? []),
      ...(row.away_team_id == null ? [] : byTeam.get(row.away_team_id) ?? []),
    ];
    const player = candidates.sort(
      (left, right) => right.avg_fouls_committed - left.avg_fouls_committed,
    )[0];
    if (!player) continue;
    alerts.set(row.id, {
      active: true,
      player_id: player.player_id,
      player_fouls: Number(player.avg_fouls_committed.toFixed(2)),
      referee_cards: referee.avg,
    });
  }
  return alerts;
}
