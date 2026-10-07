import "server-only";

import { loadBuilderBoardForFixture, type BuilderBoard } from "@/app/builder/load";
import { evaluateFixtureFactors } from "@/lib/factors/evaluator";
import { loadFixtureFactorInput } from "@/lib/factors/load-input";
import type { FactorEvaluation } from "@/lib/factors/types";
import { TARGET_LEAGUE_IDS } from "@/utils/api-football/competitions";
import { isMissingRelation } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";
import {
  buildGameScript,
  buildMatchClash,
  loadTeamFoulRates,
  loadTeamSheetContext,
  loadTeamYellowRates,
} from "@/utils/stats/discipline";
import { fixtureYellows, loadRefereeRates, lookupReferee } from "@/utils/stats/referees";

export type HubTeam = { name: string; img: string };

export type HubH2H = {
  date: string;
  competition: string;
  home: HubTeam;
  away: HubTeam;
  score: string;
  yellows: number | null;
};

export type HubPlayer = {
  id: number;
  name: string;
  number: number;
  position: string;
  imgUrl: string;
};

export type HubLineup = {
  formation: string;
  startingXI: HubPlayer[][];
};

export type MatchHubData = {
  id: number;
  homeTeam: HubTeam;
  awayTeam: HubTeam;
  time: string;
  status: string | null;
  venue: string;
  referee: string | null;
  refereeCards: number | null;
  strictRef: { name: string; avg: number; vsLeaguePct: number | null; matches?: number } | null;
  homeYellowsPerGame: number | null;
  awayYellowsPerGame: number | null;
  clash: { playerRate: number; opponentRate: number; label: string } | null;
  gameScript: { label: string; detail: string } | null;
  predictions: { homeWin: number; draw: number; awayWin: number };
  h2h: HubH2H[];
  homeLineup: HubLineup | null;
  awayLineup: HubLineup | null;
  absences: Array<{ id: number; name: string; team: string; reason: string }>;
  board: BuilderBoard;
  factors: FactorEvaluation[];
};

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
const PREMATCH = new Set(["NS", "TBD"]);

export async function resolveMatchHubId(requested: string | undefined): Promise<number | null> {
  const parsed = Number(requested);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  const supabase = createIngestClient();
  const now = new Date().toISOString();
  const [{ data: live }, { data: upcoming }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("id")
      .in("league_id", [...TARGET_LEAGUE_IDS])
      .in("status_short", [...LIVE])
      .order("date")
      .limit(1),
    supabase
      .from("fixtures")
      .select("id")
      .in("league_id", [...TARGET_LEAGUE_IDS])
      .in("status_short", [...PREMATCH])
      .gte("date", now)
      .order("date")
      .limit(1),
  ]);
  return live?.[0]?.id ?? upcoming?.[0]?.id ?? null;
}

export async function loadMatchHub(fixtureId: number): Promise<MatchHubData | null> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, referee, league_id, season, home_team_id, away_team_id, venue_id")
    .eq("id", fixtureId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const teamIds = [data.home_team_id, data.away_team_id].filter((id): id is number => id != null);
  const [{ data: teams, error: teamError }, { data: venue, error: venueError }] = await Promise.all([
    teamIds.length === 0
      ? { data: [], error: null }
      : supabase.from("teams").select("id, name, logo").in("id", teamIds),
    data.venue_id == null
      ? { data: null, error: null }
      : supabase.from("venues").select("name, city").eq("id", data.venue_id).maybeSingle(),
  ]);
  if (teamError) throw new Error(teamError.message);
  if (venueError) throw new Error(venueError.message);

  const home = (teams ?? []).find((team) => team.id === data.home_team_id) ?? null;
  const away = (teams ?? []).find((team) => team.id === data.away_team_id) ?? null;
  if (!home || !away) return null;

  const leagueId = Number(data.league_id);
  const season = Number(data.season);
  const yellowScopes = [
    { teamId: home.id, leagueId, season },
    { teamId: away.id, leagueId, season },
  ];

  const [board, prediction, meetings, lineups, absences, refs, cardRates, sheets, foulRates, factorInput] =
    await Promise.all([
      loadBuilderBoardForFixture(fixtureId),
      loadPercents(fixtureId),
      loadMeetings(fixtureId, home.id, away.id, home.name, away.name, teamImg(home), teamImg(away)),
      loadLineups(fixtureId, home.id, away.id),
      loadAbsences(fixtureId),
      loadRefereeRates(data.referee ? [data.referee] : []),
      loadTeamYellowRates(yellowScopes),
      loadTeamSheetContext(yellowScopes),
      Number.isInteger(leagueId) && Number.isInteger(season)
        ? loadTeamFoulRates(home.id, away.id, leagueId, season)
        : Promise.resolve({
            home: { committedPerGame: null, drawnPerGame: null },
            away: { committedPerGame: null, drawnPerGame: null },
          }),
      loadFixtureFactorInput(fixtureId),
    ]);

  const homeKey = `${home.id}:${leagueId}:${season}`;
  const awayKey = `${away.id}:${leagueId}:${season}`;
  const homeYellows = cardRates.get(homeKey) ?? null;
  const awayYellows = cardRates.get(awayKey) ?? null;
  const strict = lookupReferee(refs, data.referee);
  const clash = buildMatchClash(foulRates.home, foulRates.away);

  return {
    id: fixtureId,
    homeTeam: { name: home.name, img: teamImg(home) },
    awayTeam: { name: away.name, img: teamImg(away) },
    time: kickoffLabel(data.date, data.status_short),
    status: data.status_short,
    venue: venue ? [venue.name, venue.city].filter(Boolean).join(", ") : "Venue TBC",
    referee: data.referee,
    refereeCards: strict?.avg ?? null,
    strictRef: strict,
    homeYellowsPerGame: homeYellows,
    awayYellowsPerGame: awayYellows,
    clash,
    gameScript: buildGameScript({
      homeName: home.name,
      awayName: away.name,
      homeYellows,
      awayYellows,
      homeSheet: sheets.get(homeKey) ?? null,
      awaySheet: sheets.get(awayKey) ?? null,
      h2hCount: meetings.length,
    }),
    predictions: prediction,
    h2h: meetings,
    homeLineup: lineups.get(home.id) ?? null,
    awayLineup: lineups.get(away.id) ?? null,
    absences,
    board,
    factors: factorInput
      ? evaluateFixtureFactors(fixtureId, factorInput)
      : [],
  };
}

async function loadPercents(fixtureId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("percent")
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const json = data?.percent && typeof data.percent === "object" ? (data.percent as Record<string, unknown>) : {};
  return {
    homeWin: Math.round(percentNumber(json.home) ?? 0),
    draw: Math.round(percentNumber(json.draw) ?? 0),
    awayWin: Math.round(percentNumber(json.away) ?? 0),
  };
}

async function loadMeetings(
  fixtureId: number,
  homeId: number,
  awayId: number,
  homeName: string,
  awayName: string,
  homeImg: string,
  awayImg: string,
): Promise<HubH2H[]> {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, home_team_id, away_team_id, league_id, score, status_short")
    .or(
      `and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`,
    )
    .in("status_short", ["FT", "AET", "PEN"])
    .order("date", { ascending: false })
    .limit(6);
  if (error) throw new Error(error.message);
  const leagueIds = [...new Set((data ?? []).map((row) => Number(row.league_id)).filter((id) => Number.isInteger(id)))];
  const { data: leagues, error: leagueError } =
    leagueIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("leagues").select("id, name").in("id", leagueIds);
  if (leagueError) throw new Error(leagueError.message);
  const leagueById = new Map((leagues ?? []).map((row) => [Number(row.id), row.name]));
  const ids = (data ?? []).filter((row) => row.id !== fixtureId).slice(0, 5).map((row) => Number(row.id));
  const yellows = await loadMeetingYellows(ids);
  return (data ?? [])
    .filter((row) => row.id !== fixtureId)
    .slice(0, 5)
    .map((row) => {
      const homeIsStoredHome = row.home_team_id === homeId;
      return {
        date: formatDate(row.date),
        competition: leagueById.get(Number(row.league_id)) ?? "Competition",
        home: homeIsStoredHome ? { name: homeName, img: homeImg } : { name: awayName, img: awayImg },
        away: homeIsStoredHome ? { name: awayName, img: awayImg } : { name: homeName, img: homeImg },
        score: scoreText(row.score),
        yellows: yellows.get(Number(row.id)) ?? null,
      };
    });
}

async function loadLineups(fixtureId: number, homeId: number, awayId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixture_lineups")
    .select("team_id, formation, start_xi")
    .eq("fixture_id", fixtureId);
  if (error) throw new Error(error.message);
  const map = new Map<number, HubLineup>();
  for (const row of data ?? []) {
    const teamId = Number(row.team_id);
    const players = xiPlayers(row.start_xi);
    if (players.length === 0) continue;
    map.set(teamId, {
      formation: row.formation ?? "",
      startingXI: groupByLine(players, teamId === awayId),
    });
  }
  return map;
}

async function loadAbsences(fixtureId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixture_injuries")
    .select("player_id, player_name, team_id, type, reason")
    .eq("fixture_id", fixtureId);
  if (error) return [];
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const { data: clubs } = teamIds.length === 0 ? { data: [] } : await supabase.from("teams").select("id, name").in("id", teamIds);
  const nameByTeam = new Map((clubs ?? []).map((row) => [Number(row.id), row.name]));
  return (data ?? []).map((row, index) => ({
    id: index + 1,
    name: row.player_name ?? "Player",
    team: nameByTeam.get(Number(row.team_id)) ?? "Club",
    reason: [row.type, row.reason].filter(Boolean).join(" — ") || "Unavailable",
  }));
}

async function loadMeetingYellows(ids: number[]) {
  const map = new Map<number, number>();
  if (ids.length === 0) return map;
  const supabase = createIngestClient();
  const { data, error } = await supabase.from("fixture_statistics").select("fixture_id, statistics").in("fixture_id", ids);
  if (error) {
    if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) return map;
    throw error;
  }
  for (const row of data ?? []) {
    const yellows = fixtureYellows(row.statistics);
    if (yellows == null) continue;
    map.set(Number(row.fixture_id), (map.get(Number(row.fixture_id)) ?? 0) + yellows);
  }
  return map;
}

function xiPlayers(value: unknown): HubPlayer[] {
  const rows = Array.isArray(value) ? value : [];
  const players: HubPlayer[] = [];
  for (const row of rows) {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const player = rec.player && typeof rec.player === "object" ? (rec.player as Record<string, unknown>) : rec;
    const id = Number(player.id ?? rec.player_id);
    const name = String(player.name ?? rec.player_name ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !name) continue;
    players.push({
      id,
      name,
      number: Number(player.number ?? rec.number) || 0,
      position: String(player.pos ?? player.position ?? rec.position ?? ""),
      imgUrl: "",
    });
  }
  return players;
}

function groupByLine(players: HubPlayer[], attackFirst: boolean) {
  const buckets: Record<string, HubPlayer[]> = { G: [], D: [], M: [], F: [] };
  for (const player of players) {
    const key = lineKey(player.position);
    buckets[key].push(player);
  }
  const lines = [buckets.G, buckets.D, buckets.M, buckets.F].filter((line) => line.length > 0);
  return attackFirst ? [...lines].reverse() : lines;
}

function lineKey(position: string) {
  const value = position.toLowerCase();
  if (value.startsWith("g") || value.includes("gk")) return "G";
  if (value.startsWith("d") || value.includes("back") || value.includes("def")) return "D";
  if (value.startsWith("f") || value.includes("att") || value.includes("st") || value.includes("w")) return "F";
  return "M";
}

function kickoffLabel(value: string | null, status: string | null) {
  if (status && LIVE.has(status)) return status;
  if (!value) return "TBC";
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return value.slice(11, 16) || "TBC";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(stamp));
}

function formatDate(value: string | null) {
  if (!value) return "";
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(stamp),
  );
}

function scoreText(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const full = record.fulltime && typeof record.fulltime === "object" ? (record.fulltime as Record<string, unknown>) : {};
  const home = Number(full.home);
  const away = Number(full.away);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "–";
  return `${home}–${away}`;
}

function percentNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function teamImg(team: { logo?: string | null }) {
  return team.logo || "";
}
