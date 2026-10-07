import "server-only";

import { notFound } from "next/navigation";

import { cachedLogo } from "@/utils/logos";
import {
  BOOK_IDS,
  flattenBetPrices,
  latestOddsSnapshots,
  pickBookmaker,
} from "@/utils/odds-api-io/stored";
import { loadPlayerDirectory, playerLabel } from "@/utils/players/directory";
import { asNumber, asRecord, fixtureGoals, isMissingRelation, nestNumber, nestText, predictionPercents, scoreLabel, standingSide } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadRefereeRates, lookupReferee } from "@/utils/stats/referees";

import type { FoulProp } from "./prop-types";

export type FixturePage = {
  id: number;
  competition: string;
  leagueId: number;
  season: number;
  kickoff: string;
  round: string | null;
  status: string | null;
  referee: string | null;
  venue: string | null;
  home: Side;
  away: Side;
  score: string | null;
  lineups: Lineup[];
  events: EventRow[];
  stats: StatRow[];
  prices: PriceRow[];
  pricesCaptured: string | null;
  meetings: Meeting[];
  grades: PlayerGrade[];
};

type Side = { id: number; name: string; logo: string | null };

type Lineup = {
  team: string;
  formation: string | null;
  coach: string | null;
  starters: string[];
  bench: string[];
  pitch: Array<{ id: number; name: string; number: number | null; row: number; column: number; fouls: string | null }>;
};

type EventRow = { minute: string; team: string; text: string };

type StatRow = {
  label: string;
  home: string;
  away: string;
  possession: { home: number | null; away: number | null } | null;
};

type PriceRow = { market: string; value: string; odd: string };

type Meeting = { id: number; kickoff: string; competition: string; label: string; score: string };

type PlayerGrade = {
  id: number;
  name: string;
  team: string;
  rating: string | null;
  substitute: boolean;
  line: string;
};

export type Absence = {
  player: string;
  team: string;
  type: string | null;
  reason: string | null;
};

export type Forecast = {
  advice: string | null;
  winner: string | null;
  comment: string | null;
  winOrDraw: boolean | null;
  underOver: string | null;
  goalsHome: string | null;
  goalsAway: string | null;
  percentHome: string | null;
  percentDraw: string | null;
  percentAway: string | null;
  comparison: Array<{ label: string; home: string; away: string }>;
};

export type LiveBoard = {
  capturedAt: string;
  stopped: boolean;
  blocked: boolean;
  finished: boolean;
  prices: Array<{ market: string; value: string; odd: string }>;
};

export async function loadLiveOdds(fixtureId: number): Promise<LiveBoard | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("live_odds")
    .select("odds_data, updated_at, status, bookmaker_id")
    .eq("fixture_id", fixtureId)
    .in("bookmaker_id", [...BOOK_IDS])
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    odds_data: unknown;
    updated_at: string | null;
    status: unknown;
    bookmaker_id: number;
  }>;
  const chosen = pickBookmaker(
    latestOddsSnapshots(
      rows.map((row) => ({
        fixture_id: fixtureId,
        bookmaker_id: row.bookmaker_id,
        odds_data: row.odds_data,
        updated_at: row.updated_at,
      })),
    ),
  ).get(fixtureId);
  if (!chosen) return null;
  const status = chosen && rows.find((row) => row.bookmaker_id === chosen.bookmaker_id)?.status;
  const record = status && typeof status === "object" ? (status as Record<string, unknown>) : {};
  return {
    capturedAt: chosen.updated_at ?? new Date().toISOString(),
    stopped: record.stopped === true,
    blocked: record.blocked === true,
    finished: record.finished === true,
    prices: flattenBetPrices(chosen.odds_data).slice(0, 16),
  };
}

export async function loadForecast(fixtureId: number): Promise<Forecast | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("predictions")
    .select("advice, win_or_draw, under_over, percent, winner, goals, comparison, prediction_data")
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const winner = asRecord(data.winner);
  const goals = asRecord(data.goals);
  const percents = predictionPercents(data.percent);
  return {
    advice: data.advice,
    winner: text(winner?.name),
    comment: text(winner?.comment),
    winOrDraw: data.win_or_draw,
    underOver: data.under_over,
    goalsHome: text(goals?.home),
    goalsAway: text(goals?.away),
    percentHome: percents.home,
    percentDraw: percents.draw,
    percentAway: percents.away,
    comparison: comparisonRows(data.comparison ?? asRecord(data.prediction_data)?.comparison),
  };
}

const COMPARISON_LABELS: Record<string, string> = {
  att: "Attack",
  def: "Defence",
  poisson_distribution: "Poisson",
  h2h: "Head to head",
};

function comparisonRows(value: unknown) {
  const block = asRecord(value);
  if (!block) return [];
  return Object.entries(COMPARISON_LABELS).flatMap(([key, label]) => {
    const side = asRecord(block[key]);
    const home = text(side?.home);
    const away = text(side?.away);
    if (!home && !away) return [];
    return [{ label, home: home ?? "–", away: away ?? "–" }];
  });
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export async function loadFixtureAbsences(fixtureId: number): Promise<Absence[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_injuries")
    .select("player_name, team_id, type, reason")
    .eq("fixture_id", fixtureId)
    .order("team_id");
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const { data: clubs } = teamIds.length
    ? await supabase.from("teams").select("id, name").in("id", teamIds)
    : { data: [] };
  const teamName = new Map((clubs ?? []).map((row) => [Number(row.id), row.name]));
  const seen = new Set<string>();
  return (data ?? []).flatMap((row) => {
    const absence = {
      player: row.player_name ?? "Player",
      team: teamName.get(Number(row.team_id)) ?? "Club",
      type: row.type,
      reason: row.reason,
    };
    const key = `${absence.player}|${absence.type}|${absence.reason}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [absence];
  });
}

export async function loadFixture(id: number): Promise<FixturePage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, referee, home_goals, away_goals, score, league_id, season, venue_id, home_team_id, away_team_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  const homeId = data.home_team_id;
  const awayId = data.away_team_id;
  const leagueId = data.league_id;
  if (homeId == null || awayId == null || leagueId == null) notFound();

  const [{ data: home }, { data: away }, { data: venue }, { data: competition }] = await Promise.all([
    supabase.from("teams").select("id, name, logo").eq("id", homeId).maybeSingle(),
    supabase.from("teams").select("id, name, logo").eq("id", awayId).maybeSingle(),
    data.venue_id ? supabase.from("venues").select("name, city").eq("id", data.venue_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("leagues").select("name").eq("id", leagueId).maybeSingle(),
  ]);
  if (!home || !away) notFound();

  const [lineups, events, stats, prices, meetings, grades] = await Promise.all([
    loadLineups(id),
    loadEvents(id),
    loadStats(id, home.id, away.id),
    loadPrices(id),
    loadMeetings(id, home.id, away.id, home.name, away.name),
    loadGrades(id),
  ]);

  return {
    id,
    competition: competition?.name ?? "Competition",
    leagueId,
    season: data.season ?? 0,
    kickoff: formatKickoff(data.date),
    round: null,
    status: data.status_short,
    referee: data.referee,
    venue: venue ? [venue.name, venue.city].filter(Boolean).join(", ") : null,
    home: { id: home.id, name: home.name, logo: await cachedLogo("teams", home.id, home.logo) },
    away: { id: away.id, name: away.name, logo: await cachedLogo("teams", away.id, away.logo) },
    score: scoreLabel(data),
    lineups,
    events,
    stats,
    prices: prices.rows,
    pricesCaptured: prices.capturedAt,
    meetings,
    grades,
  };
}

async function loadLineups(fixtureId: number): Promise<Lineup[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_lineups")
    .select("team_id, formation, coach, start_xi, substitutes")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  const teamIds = [...new Set(((data ?? []) as Array<{ team_id: number }>).map((row) => row.team_id))];
  const { data: clubs } = teamIds.length ? await supabase.from("teams").select("id, name").in("id", teamIds) : { data: [] };
  const names = new Map((clubs ?? []).map((club) => [club.id, club.name]));
  return ((data ?? []) as Array<{
    team_id: number;
    formation: string | null;
    coach: unknown;
    start_xi: unknown;
    substitutes: unknown;
  }>).map((row) => {
    const starters = xiPeople(row.start_xi);
    const bench = xiPeople(row.substitutes);
    return {
      team: names.get(row.team_id) ?? "Team",
      formation: row.formation,
      coach: coachName(row.coach),
      starters: starters.map((player) => [player.number, player.name].filter(Boolean).join(" ")),
      bench: bench.map((player) => [player.number, player.name].filter(Boolean).join(" ")),
      pitch: starters.map((player, index) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        row: player.row,
        column: player.column || index + 1,
        fouls: null,
      })),
    };
  });
}

function coachName(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name : null;
}

function xiPeople(value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  const people: Array<{ id: number; name: string; number: number | null; row: number; column: number }> = [];
  for (const [index, row] of rows.entries()) {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const player = rec.player && typeof rec.player === "object" ? (rec.player as Record<string, unknown>) : rec;
    const id = Number(player.id ?? rec.player_id);
    const name = String(player.name ?? rec.player_name ?? "").trim();
    if (!name) continue;
    const grid = String(player.grid ?? rec.grid ?? "");
    const slot = pitchSlot(grid);
    people.push({
      id: Number.isInteger(id) && id > 0 ? id : index + 1,
      name,
      number: Number(player.number ?? rec.number) || null,
      row: slot?.row ?? index + 1,
      column: slot?.column ?? index + 1,
    });
  }
  return people;
}

export type Leader = { name: string; meta: string; value: string; recent: string | null };
export type SideLeaders = { team: string; fouls: Leader[]; shots: Leader[] };

export async function loadSideLeaders(leagueId: number, season: number, home: { id: number; name: string }, away: { id: number; name: string }): Promise<SideLeaders[]> {
  const supabase = createAdminClient();
  const teamIds = [home.id, away.id];
  const [{ data: fouls, error: foulError }, { data: shots, error: shotError }] = await Promise.all([
    supabase.from("player_season_stats").select("player_id, team_id, appearances, stats_data").in("team_id", teamIds).gt("appearances", 0),
    supabase.from("player_season_stats").select("player_id, team_id, stats_data").eq("league_id", leagueId).eq("season", season).in("team_id", teamIds),
  ]);
  if (foulError) throw foulError;
  if (shotError) throw shotError;
  const ids = [...new Set((fouls ?? []).map((row) => row.player_id))];
  const directory = await loadPlayerDirectory(supabase, ids, { teamIds });
  const side = (teamId: number, team: string): SideLeaders => ({
    team,
    fouls: (fouls ?? [])
      .filter((row) => row.team_id === teamId)
      .map((row) => {
        const appearances = Number(row.appearances);
        const committed = nestNumber(row.stats_data, "fouls", "committed") ?? 0;
        const average = appearances > 0 ? committed / appearances : 0;
        return {
          name: playerLabel(directory, Number(row.player_id)),
          meta: `${appearances || 0} matches`,
          value: average.toFixed(2),
          recent: null,
          sort: average,
        };
      })
      .filter((row) => Number(row.value) >= 1.2)
      .sort((left, right) => right.sort - left.sort)
      .slice(0, 8)
      .map(({ sort: _sort, ...row }) => row),
    shots: (shots ?? [])
      .filter((row) => row.team_id === teamId)
      .map((row) => ({
        name: playerLabel(directory, Number(row.player_id)),
        meta: nestText(row.stats_data, "games", "position") ?? "Shots",
        value: String(nestNumber(row.stats_data, "shots", "total") ?? 0),
        recent: null,
        sort: nestNumber(row.stats_data, "shots", "total") ?? 0,
      }))
      .filter((row) => row.sort > 0)
      .sort((left, right) => right.sort - left.sort)
      .slice(0, 8)
      .map(({ sort: _sort, ...row }) => row),
  });
  return [side(home.id, home.name), side(away.id, away.name)];
}

export type MatchFacts = {
  referee: { name: string; matches: number; yellows: number } | null;
  table: Array<{
    teamId: number;
    team: string;
    rank: number | null;
    played: number | null;
    win: number | null;
    draw: number | null;
    lose: number | null;
    diff: number | null;
    points: number | null;
    xg: number | null;
    xc: number | null;
    homeCorners: number | null;
    awayCorners: number | null;
    corners: number | null;
  }>;
};

function average(value: number | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export async function loadMatchFacts(leagueId: number, season: number, referee: string | null, homeId: number, awayId: number): Promise<MatchFacts> {
  const supabase = createAdminClient();
  const refereeName = referee?.split(",")[0]?.trim() || null;
  const [{ data: table, error: tableError }, refs, sheetResult, { data: clubs }] = await Promise.all([
    supabase.from("standings").select("team_id, rank, goals_diff, points, all_stats").eq("league_id", leagueId).eq("season", season).in("team_id", [homeId, awayId]),
    loadRefereeRates(refereeName ? [refereeName] : []),
    supabase.from("team_match_sheet_totals").select("team_id, xg_per_game, xc_per_game, home_corners_per_game, away_corners_per_game, corners_per_game").eq("league_id", leagueId).eq("season", season).in("team_id", [homeId, awayId]),
    supabase.from("teams").select("id, name").in("id", [homeId, awayId]),
  ]);
  if (tableError) throw tableError;
  if (sheetResult.error && !isMissingRelation(sheetResult.error)) throw sheetResult.error;
  const sheets = new Map((sheetResult.data ?? []).map((row) => [row.team_id, row]));
  const names = new Map((clubs ?? []).map((club) => [club.id, club.name]));
  const rows = (table ?? []).map((row) => {
    const sheet = sheets.get(row.team_id);
    const all = standingSide(row.all_stats);
    return {
      teamId: row.team_id,
      team: names.get(row.team_id) ?? "Club",
      rank: row.rank,
      played: all.played,
      win: all.win,
      draw: all.draw,
      lose: all.lose,
      diff: row.goals_diff,
      points: row.points,
      xg: average(sheet?.xg_per_game),
      xc: average(sheet?.xc_per_game),
      homeCorners: average(sheet?.home_corners_per_game),
      awayCorners: average(sheet?.away_corners_per_game),
      corners: average(sheet?.corners_per_game),
    };
  });
  const ordered = [homeId, awayId].map((id) => rows.find((row) => row.teamId === id)).filter((row) => row != null);
  const derived = lookupReferee(refs, refereeName);
  return {
    referee: derived ? { name: derived.name, matches: derived.matches, yellows: derived.avg } : null,
    table: ordered,
  };
}

export async function loadTeamForms(leagueId: number, season: number, homeId: number, awayId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("standings").select("team_id, form").eq("league_id", leagueId).eq("season", season).in("team_id", [homeId, awayId]);
  if (error) throw error;
  const forms = new Map<number, string>();
  for (const row of data ?? []) {
    if (row.form && !forms.has(row.team_id)) forms.set(row.team_id, row.form);
  }
  return { home: forms.get(homeId) ?? null, away: forms.get(awayId) ?? null };
}

function pitchSlot(grid: string | null) {
  if (!grid) return null;
  const [rowText, columnText] = grid.split(":");
  const row = Number(rowText);
  const column = Number(columnText);
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 1 || column < 1) return null;
  return { row, column };
}

async function loadEvents(fixtureId: number): Promise<EventRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_events")
    .select("time_elapsed, time_extra, type, detail, team_id, player_id, assist_id")
    .eq("fixture_id", fixtureId)
    .order("time_elapsed", { nullsFirst: false })
    .order("time_extra", { nullsFirst: true });
  if (error) {
    if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) return [];
    throw error;
  }
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)).filter((id) => id > 0))];
  const playerIds = [...new Set((data ?? []).flatMap((row) => [row.player_id, row.assist_id]).map(Number).filter((id) => id > 0))];
  const [{ data: clubs }, directory] = await Promise.all([
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
    loadPlayerDirectory(supabase, playerIds, { teamIds }),
  ]);
  const teamNames = new Map((clubs ?? []).map((club) => [club.id, club.name]));
  const playerNames = new Map([...directory].map(([id, person]) => [id, person.name]));
  return ((data ?? []) as EventQuery[]).map((row) => ({
    minute: eventMinute(row.time_elapsed, row.time_extra),
    team: teamNames.get(Number(row.team_id)) ?? "",
    text: eventText(row, playerNames),
  }));
}

function eventMinute(elapsed: number | null, extra: number | null) {
  if (elapsed === null && (extra === null || extra === 0)) return "";
  if (extra != null && extra > 0) return `${elapsed ?? 0}+${extra}`;
  return String(elapsed ?? "");
}

function eventText(row: EventQuery, playerNames: Map<number, string>) {
  const player = playerNames.get(Number(row.player_id)) ?? null;
  const assist = playerNames.get(Number(row.assist_id)) ?? null;
  if (row.type === "Goal") {
    return [player, row.detail, assist ? `assist ${assist}` : null].filter(Boolean).join(" · ");
  }
  if (row.type === "subst") {
    if (player && assist) return `${assist} on for ${player}`;
    return [player ?? assist, row.detail].filter(Boolean).join(" · ");
  }
  return [player, row.detail ?? row.type].filter(Boolean).join(" · ");
}

async function loadStats(fixtureId: number, homeId: number, awayId: number): Promise<StatRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_statistics")
    .select("team_id, statistics")
    .eq("fixture_id", fixtureId);
  if (error) {
    if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) return [];
    throw error;
  }
  const home = ((data ?? []) as StatQuery[]).find((row) => row.team_id === homeId)?.statistics ?? {};
  const away = ((data ?? []) as StatQuery[]).find((row) => row.team_id === awayId)?.statistics ?? {};
  const labels: Array<[string, string, boolean]> = [
    ["Shots on Goal", "Shots on target", false],
    ["Shots off Goal", "Shots off target", false],
    ["Total Shots", "Total shots", false],
    ["Blocked Shots", "Blocked shots", false],
    ["Shots insidebox", "Shots inside the box", false],
    ["Shots outsidebox", "Shots outside the box", false],
    ["Fouls", "Fouls committed", false],
    ["Corner Kicks", "Corners", false],
    ["Offsides", "Offsides", false],
    ["Ball Possession", "Possession", true],
    ["Yellow Cards", "Yellow cards", false],
    ["Red Cards", "Red cards", false],
    ["Goalkeeper Saves", "Saves", false],
    ["Total passes", "Total passes", false],
    ["Passes accurate", "Accurate passes", false],
    ["Passes %", "Pass accuracy", true],
  ];
  return labels.flatMap(([key, label, percent]) => {
    const homeValue = percent ? percentText(home[key]) : plainStat(home[key]);
    const awayValue = percent ? percentText(away[key]) : plainStat(away[key]);
    if (homeValue === null && awayValue === null) return [];
    return [
      {
        label,
        home: homeValue ?? "–",
        away: awayValue ?? "–",
        possession: percent && label === "Possession" ? { home: percentNumber(home[key]), away: percentNumber(away[key]) } : null,
      },
    ];
  });
}

async function loadGrades(fixtureId: number): Promise<PlayerGrade[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_player_statistics")
    .select("player_id, team_id, statistics")
    .eq("fixture_id", fixtureId);
  if (error) {
    if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) return [];
    throw error;
  }
  const playerIds = [...new Set((data ?? []).map((row) => Number(row.player_id)))];
  const teamIds = [...new Set((data ?? []).map((row) => Number(row.team_id)))];
  const [directory, { data: clubs }] = await Promise.all([
    loadPlayerDirectory(supabase, playerIds, { teamIds }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ]);
  const teamNames = new Map((clubs ?? []).map((club) => [club.id, club.name]));
  return (data ?? [])
    .map((row) => {
      const block = Array.isArray(row.statistics)
        ? asRecord(row.statistics[0])
        : asRecord(row.statistics);
      const games = asRecord(block?.games);
      const goals = asRecord(block?.goals);
      const shots = asRecord(block?.shots);
      const passes = asRecord(block?.passes);
      const tackles = asRecord(block?.tackles);
      const fouls = asRecord(block?.fouls);
      const cards = asRecord(block?.cards);
      const penalty = asRecord(block?.penalty);
      const minutes = asNumber(games?.minutes);
      const rating = games?.rating == null ? null : String(games.rating);
      const line = [
        minutes == null ? null : `${minutes} min`,
        countLabel(goals?.total, "goal", "goals"),
        countLabel(goals?.assists, "assist", "assists"),
        countLabel(shots?.on, "shot on target", "shots on target"),
        countLabel(passes?.key, "key pass", "key passes"),
        countLabel(tackles?.total, "tackle", "tackles"),
        countLabel(cards?.yellow, "yellow card", "yellow cards"),
        countLabel(cards?.red, "red card", "red cards"),
        countLabel(fouls?.committed, "foul committed", "fouls committed"),
        countLabel(fouls?.drawn, "foul drawn", "fouls drawn"),
        countLabel(penalty?.scored, "penalty scored", "penalties scored"),
        countLabel(penalty?.missed, "penalty missed", "penalties missed"),
      ]
        .filter((part): part is string => part !== null)
        .join(" · ");
      return {
        id: row.player_id,
        name: playerLabel(directory, Number(row.player_id)),
        team: teamNames.get(row.team_id) ?? "",
        rating,
        substitute: Boolean(games?.substitute),
        line,
        sort: ratingNumber(rating),
      };
    })
    .filter((row) => {
      const minutesMatch = row.line.match(/^(\d+) min/);
      return minutesMatch ? Number(minutesMatch[1]) > 0 : row.line.length > 0;
    })
    .sort((left, right) => right.sort - left.sort || left.name.localeCompare(right.name))
    .map(({ sort: _sort, ...grade }) => grade);
}

function ratingNumber(value: string | null) {
  if (!value) return -1;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

function countLabel(value: unknown, singular: string, plural: string) {
  const count = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : null;
  if (count === null || !Number.isFinite(count) || count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

export type { FoulProp } from "./prop-types";

export async function loadFoulProps(fixtureId: number, homeId: number, awayId: number): Promise<FoulProp[]> {
  const supabase = createAdminClient();
  const { data: players, error: playerError } = await supabase
    .from("player_season_stats")
    .select("player_id, team_id, appearances, stats_data")
    .in("team_id", [homeId, awayId])
    .gt("appearances", 0);
  if (playerError) throw playerError;
  const ids = [...new Set((players ?? []).map((row) => Number(row.player_id)))];
  const directory = await loadPlayerDirectory(supabase, ids, { teamIds: [homeId, awayId] });
  return (players ?? [])
    .flatMap((row): FoulProp[] => {
      const appearances = Number(row.appearances);
      const fouls = nested((row.stats_data as Record<string, unknown> | null)?.fouls).committed;
      if (!Number.isFinite(appearances) || appearances <= 0 || !Number.isFinite(fouls) || fouls <= 0) return [];
      const average = fouls / appearances;
      if (average < 1.2) return [];
      const side: FoulProp["side"] =
        Number(row.team_id) === homeId ? "home" : Number(row.team_id) === awayId ? "away" : "listed";
      return [
        {
          name: playerLabel(directory, Number(row.player_id)),
          side,
          line: 1,
          odd: "",
          average: average.toFixed(2),
          matches: appearances,
          recent: [] as number[],
        },
      ];
    })
    .sort((left, right) => Number(right.average) - Number(left.average))
    .slice(0, 16);
}

function nested(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    const number = Number(item);
    if (Number.isFinite(number)) out[key] = number;
  }
  return out;
}

async function loadPrices(fixtureId: number): Promise<{ rows: PriceRow[]; capturedAt: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prematch_odds")
    .select("odds_data, updated_at, bookmaker_id")
    .eq("fixture_id", fixtureId)
    .in("bookmaker_id", [...BOOK_IDS])
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const chosen = pickBookmaker(
    latestOddsSnapshots(
      ((data ?? []) as Array<{ odds_data: unknown; updated_at: string | null; bookmaker_id: number }>).map((row) => ({
        fixture_id: fixtureId,
        bookmaker_id: row.bookmaker_id,
        odds_data: row.odds_data,
        updated_at: row.updated_at,
      })),
    ),
  ).get(fixtureId);
  if (!chosen) return { rows: [], capturedAt: null };
  const wanted = new Set(["Match Winner", "Goals Over/Under", "Both Teams Score", "Both Teams to Score", "Double Chance"]);
  const rows = flattenBetPrices(chosen.odds_data).filter((price) => {
    if (!wanted.has(price.market) && !price.market.toLowerCase().includes("winner") && !price.market.toLowerCase().includes("over")) {
      return price.market.toLowerCase().includes("btts") || price.market.toLowerCase().includes("score");
    }
    if (price.market === "Goals Over/Under") {
      return price.value === "Over 1.5" || price.value === "Under 1.5" || price.value === "Over 2.5" || price.value === "Under 2.5";
    }
    return true;
  });
  return { rows, capturedAt: chosen.updated_at ?? null };
}

async function loadMeetings(
  fixtureId: number,
  homeId: number,
  awayId: number,
  home: string,
  away: string,
): Promise<Meeting[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixtures")
    .select("id, date, home_goals, away_goals, score, home_team_id, away_team_id, league_id")
    .or(
      `and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`,
    )
    .not("home_goals", "is", null)
    .order("date", { ascending: false })
    .limit(6);
  if (error) throw error;
  const leagueIds = [...new Set(((data ?? []) as MeetingQuery[]).map((row) => row.league_id).filter(Boolean))];
  const { data: competitions } = leagueIds.length
    ? await supabase.from("leagues").select("id, name").in("id", leagueIds)
    : { data: [] };
  const names = new Map((competitions ?? []).map((row) => [row.id, row.name]));
  return ((data ?? []) as MeetingQuery[])
    .filter((row) => row.id !== fixtureId)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      kickoff: formatKickoff(row.date),
      competition: names.get(row.league_id) ?? "Competition",
      label: row.home_team_id === homeId ? `${home} v ${away}` : `${away} v ${home}`,
      score: scoreLabel(row) ?? "",
    }));
}

function plainStat(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function percentNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function percentText(value: unknown) {
  const parsed = percentNumber(value);
  return parsed === null ? null : `${parsed}%`;
}

function formatKickoff(value: string | null) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 16);
}

type TeamSide = { id: number; name: string; logo: string | null };
type Venue = { name: string | null; city: string | null };

type EventQuery = {
  time_elapsed: number | null;
  time_extra: number | null;
  type: string | null;
  detail: string | null;
  team_id: number | null;
  player_id: number | null;
  assist_id: number | null;
};
type StatQuery = { team_id: number; statistics: Record<string, unknown> };
type MeetingQuery = {
  id: number;
  date: string | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
  home_team_id: number;
  away_team_id: number;
  league_id: number;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
