import "server-only";

import { loadPlayerDirectory, playerLabel } from "@/utils/players/directory";
import { asRecord, isMissingRelation, scoreLabel } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";

export type ClubExtras = {
  coach: {
    id: number;
    name: string;
    photo: string | null;
    age: number | null;
    nationality: string | null;
    career: Array<{ team: string; start: string | null; end: string | null }>;
    spells: Array<{ type: string | null; start: string | null; end: string | null }>;
  } | null;
  venue: ClubVenue | null;
  trophies: string[];
  transfers: string[];
  injuries: string[];
  sidelined: string[];
  recent: ResultRow[];
  next: ResultRow | null;
};

export type ClubVenue = {
  name: string;
  place: string | null;
  capacity: number | null;
  surface: string | null;
  imageUrl: string | null;
};

export type ResultRow = {
  id: number;
  kickoff: string;
  label: string;
  score: string | null;
  statusLabel: string | null;
};

export async function loadClubExtras(teamId: number): Promise<ClubExtras> {
  const [coach, venue, transfers, injuries, sidelined, recent, next] = await Promise.all([
    loadCoach(teamId),
    loadVenue(teamId),
    loadClubTransfers(teamId),
    loadInjuries(teamId),
    loadSidelined(teamId),
    loadResults(teamId),
    loadNext(teamId),
  ]);
  return {
    coach,
    venue,
    trophies: [],
    transfers,
    injuries,
    sidelined,
    recent,
    next,
  };
}

async function loadCoach(teamId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("team_coaches")
    .select("coach_id, name, photo, age, nationality, career, updated_at")
    .eq("team_id", teamId);
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const row = pickCurrentCoach((data ?? []) as CoachRow[], teamId);
  if (!row?.name) return null;
  return {
    id: row.coach_id,
    name: row.name,
    photo: row.photo,
    age: row.age,
    nationality: row.nationality,
    career: careerJobs(row.career),
    spells: [] as Array<{ type: string | null; start: string | null; end: string | null }>,
  };
}

function pickCurrentCoach(rows: CoachRow[], teamId: number) {
  const ranked = rows.map((row) => {
    const atClub = careerJobs(row.career).filter((job) => job.teamId === teamId);
    const open = atClub.find((job) => !job.end);
    const newest = [...atClub].sort((left, right) => (right.start ?? "").localeCompare(left.start ?? ""))[0];
    return {
      row,
      current: Boolean(open),
      start: open?.start ?? newest?.start ?? "",
      updated: row.updated_at ?? "",
    };
  });
  const open = ranked.filter((item) => item.current).sort((left, right) => right.start.localeCompare(left.start));
  if (open[0]) return open[0].row;
  return ranked.sort((left, right) => right.updated.localeCompare(left.updated) || right.start.localeCompare(left.start))[0]?.row ?? null;
}

function careerJobs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const team = asRecord(row.team);
    const name = typeof team?.name === "string" && team.name.trim() ? team.name : null;
    if (!name) return [];
    const teamId = Number(team?.id);
    return [
      {
        teamId: Number.isInteger(teamId) && teamId > 0 ? teamId : null,
        team: name,
        start: asDate(row.start),
        end: asDate(row.end),
      },
    ];
  });
}

function asDate(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function loadVenue(teamId: number): Promise<ClubVenue | null> {
  const supabase = createIngestClient();
  const { data, error } = await supabase.from("teams").select("venue_id").eq("id", teamId).maybeSingle();
  if (error) throw error;
  const venueId = Number(data?.venue_id);
  if (!Number.isInteger(venueId) || venueId <= 0) return null;
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("name, address, city, capacity, surface, image")
    .eq("id", venueId)
    .maybeSingle();
  if (venueError) throw venueError;
  if (!venue?.name) return null;
  const place = [venue.address, venue.city].filter(Boolean).join(", ");
  return {
    name: venue.name,
    place: place || null,
    capacity: venue.capacity,
    surface: venue.surface,
    imageUrl: venue.image,
  };
}

async function loadClubTransfers(teamId: number) {
  const rows = await transferRows({ teamId });
  const names = await playerNames(rows.map((row) => row.player_id));
  return rows.map((row) =>
    [row.transfer_date, names.get(row.player_id) ?? "Player", row.transfer_type, moveLine(row)].filter(Boolean).join(" · "),
  );
}

export type PlayerAvailability = {
  spells: Array<{ type: string | null; start: string | null; end: string | null }>;
  missed: number | null;
  overlap: "none" | "unsheeted" | "counted";
  rated: string[];
};

export async function loadPlayerAvailability(playerId: number, leagueId: number, season: number): Promise<PlayerAvailability> {
  const supabase = createIngestClient();
  const { data: spells, error } = await supabase
    .from("player_sidelined")
    .select("type, start_date, end_date")
    .eq("player_id", playerId)
    .order("start_date", { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return { spells: [], missed: null, overlap: "none", rated: [] };
    throw error;
  }
  const history = ((spells ?? []) as SpellRow[]).map((row) => ({
    type: row.type,
    start: row.start_date,
    end: row.end_date,
  }));
  const { data: memberships, error: memberError } = await supabase
    .from("player_teams_history")
    .select("team_id, seasons")
    .eq("player_id", playerId);
  if (memberError) {
    if (isMissingRelation(memberError)) return { spells: history, missed: null, overlap: "none", rated: [] };
    throw memberError;
  }
  const rated = await seasonRatings(playerId, leagueId, season);
  const teamIds = [
    ...new Set(
      (memberships ?? [])
        .filter((row) => Array.isArray(row.seasons) && row.seasons.includes(season))
        .map((row) => Number(row.team_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (teamIds.length === 0 || history.length === 0) return { spells: history, missed: null, overlap: "none", rated };

  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, date, status_short, home_team_id, away_team_id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .or(teamIds.map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(","));
  if (fixtureError) throw fixtureError;
  const covered = ((fixtures ?? []) as CoveredFixture[]).filter((fixture) => {
    const day = fixture.date?.slice(0, 10);
    return day ? history.some((spell) => spellCovers(spell, day)) : false;
  });
  const finished = covered.filter((fixture) => FINISHED.has(fixture.status_short ?? ""));
  if (finished.length === 0) return { spells: history, missed: null, overlap: "none", rated };

  const ids = finished.map((fixture) => fixture.id);
  const { data: sheets, error: sheetError } = await supabase
    .from("fixture_player_statistics")
    .select("fixture_id, player_id, statistics")
    .in("fixture_id", ids);
  if (sheetError) {
    if (isMissingRelation(sheetError) || /column .* does not exist/i.test(sheetError.message)) {
      return { spells: history, missed: null, overlap: "unsheeted", rated };
    }
    throw sheetError;
  }
  const withSheet = new Set((sheets ?? []).map((row) => Number(row.fixture_id)));
  const played = new Set(
    (sheets ?? [])
      .filter((row) => Number(row.player_id) === playerId && minutesPlayed(row.statistics) > 0)
      .map((row) => Number(row.fixture_id)),
  );
  const countable = finished.filter((fixture) => withSheet.has(fixture.id));
  if (countable.length === 0) return { spells: history, missed: null, overlap: "unsheeted", rated };
  return {
    spells: history,
    missed: countable.filter((fixture) => !played.has(fixture.id)).length,
    overlap: "counted",
    rated,
  };
}

const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function spellCovers(spell: { start: string | null; end: string | null }, day: string) {
  if (!spell.start || day < spell.start) return false;
  const end = spell.end?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return true;
  return day <= end;
}

function minutesPlayed(statistics: unknown) {
  const first = Array.isArray(statistics) ? statistics[0] : statistics;
  const games = asRecord(asRecord(first)?.games);
  return Number(games?.minutes) || 0;
}

async function seasonRatings(playerId: number, leagueId: number, season: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixture_player_statistics")
    .select("statistics, fixture_id")
    .eq("player_id", playerId);
  if (error) {
    if (isMissingRelation(error) || /column .* does not exist/i.test(error.message)) return [];
    throw error;
  }
  const fixtureIds = [...new Set((data ?? []).map((row) => Number(row.fixture_id)).filter((id) => id > 0))];
  if (fixtureIds.length === 0) return [];
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, date, league_id, season")
    .in("id", fixtureIds);
  if (fixtureError) throw fixtureError;
  const meta = new Map((fixtures ?? []).map((row) => [Number(row.id), row]));
  return ((data ?? []) as Array<{ statistics: unknown; fixture_id: number }>)
    .filter((row) => {
      const fixture = meta.get(Number(row.fixture_id));
      return minutesPlayed(row.statistics) > 0 && fixture?.league_id === leagueId && fixture.season === season;
    })
    .sort((left, right) => (meta.get(left.fixture_id)?.date ?? "").localeCompare(meta.get(right.fixture_id)?.date ?? ""))
    .flatMap((row) => {
      const first = Array.isArray(row.statistics) ? row.statistics[0] : row.statistics;
      const games = asRecord(asRecord(first)?.games);
      const rating = typeof games?.rating === "string" ? games.rating : null;
      return rating ? [rating] : [];
    });
}

type SpellRow = { type: string | null; start_date: string | null; end_date: string | null };
type CoveredFixture = { id: number; date: string | null; status_short: string | null; home_team_id: number | null; away_team_id: number | null };
type CoachRow = {
  coach_id: number;
  name: string | null;
  photo: string | null;
  age: number | null;
  nationality: string | null;
  career: unknown;
  updated_at?: string | null;
};

export async function loadPlayerTrophies(playerId: number) {
  const supabase = createIngestClient();
  const rows: Honour[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("player_trophies")
      .select("league, country, season, place")
      .eq("player_id", playerId)
      .order("season", { ascending: false })
      .range(from, from + 999);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    rows.push(...((data ?? []) as Honour[]));
    if (!data || data.length < 1000) break;
  }
  return rows.map(honourLine);
}

function honourLine(row: Honour) {
  return [row.place, row.league, row.country, row.season].filter(Boolean).join(" · ");
}

export async function loadPlayerTransfers(playerId: number) {
  const rows = await transferRows({ playerId });
  return rows.map((row) => [row.transfer_date, row.transfer_type, moveLine(row)].filter(Boolean).join(" · "));
}

async function transferRows(filter: { playerId?: number; teamId?: number }) {
  const supabase = createIngestClient();
  const rows: TransferRow[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("player_transfers")
      .select("player_id, transfer_date, transfer_type, team_in_name, team_out_name")
      .order("transfer_date", { ascending: false });
    if (filter.playerId != null) query = query.eq("player_id", filter.playerId);
    if (filter.teamId != null) query = query.or(`team_in_id.eq.${filter.teamId},team_out_id.eq.${filter.teamId}`);
    const { data, error } = await query.range(from, from + 999);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    rows.push(...((data ?? []) as TransferRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function moveLine(row: TransferRow) {
  const origin = row.team_out_name;
  const destination = row.team_in_name;
  if (origin && destination) return `${origin} → ${destination}`;
  return origin ?? destination ?? null;
}

async function loadInjuries(teamId: number) {
  const supabase = createIngestClient();
  const { data, error } = await supabase
    .from("fixture_injuries")
    .select("player_name, type, reason")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const lines = (data ?? []).map((row) => [row.player_name, row.type, row.reason].filter(Boolean).join(" · "));
  return [...new Set(lines)].slice(0, 12);
}

async function loadSidelined(teamId: number) {
  const supabase = createIngestClient();
  const { data: squad, error } = await supabase.from("team_squads").select("player_id").eq("team_id", teamId);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  const ids = [...new Set((squad ?? []).map((row) => Number(row.player_id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];

  const rows: Array<{ player_id: number; type: string | null; start_date: string | null; end_date: string | null }> = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error: sidelinedError } = await supabase
      .from("player_sidelined")
      .select("player_id, type, start_date, end_date")
      .in("player_id", ids.slice(index, index + 100))
      .order("start_date", { ascending: false })
      .limit(40);
    if (sidelinedError) {
      if (isMissingRelation(sidelinedError)) return [];
      throw sidelinedError;
    }
    rows.push(...((data ?? []) as typeof rows));
  }

  const names = await playerNames(rows.map((row) => row.player_id));
  return rows
    .sort((left, right) => (right.start_date ?? "").localeCompare(left.start_date ?? ""))
    .slice(0, 12)
    .map((row) => [names.get(row.player_id) ?? "Player", row.type, row.start_date, row.end_date].filter(Boolean).join(" · "));
}

async function playerNames(playerIds: number[]) {
  const ids = [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))];
  const names = new Map<number, string>();
  if (ids.length === 0) return names;
  const supabase = createIngestClient();
  const directory = await loadPlayerDirectory(supabase, ids);
  for (const id of ids) names.set(id, playerLabel(directory, id));
  return names;
}

async function loadResults(teamId: number) {
  const rows = await clubFixtures(teamId, false);
  return rows.slice(0, 5);
}

async function loadNext(teamId: number) {
  const rows = await clubFixtures(teamId, true);
  return rows[0] ?? null;
}

async function clubFixtures(teamId: number, upcoming: boolean): Promise<ResultRow[]> {
  const supabase = createIngestClient();
  let query = supabase
    .from("fixtures")
    .select("id, date, status_short, home_goals, away_goals, score, home_team_id, away_team_id")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("date", { ascending: upcoming })
    .limit(5);
  query = upcoming
    ? query.in("status_short", ["NS", "TBD", "PST", "CANC", "SUSP", "ABD", "1H", "HT", "2H", "LIVE", "ET", "BT", "P"])
    : query.not("home_goals", "is", null);
  const { data, error } = await query;
  if (error) throw error;
  const teamIds = [...new Set((data ?? []).flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null))];
  const { data: clubs } = teamIds.length ? await supabase.from("teams").select("id, name").in("id", teamIds) : { data: [] };
  const names = new Map((clubs ?? []).map((club) => [club.id, club.name]));
  return ((data ?? []) as FixtureQuery[]).map((row) => ({
    id: row.id,
    kickoff: String(row.date ?? "").replace("T", " ").slice(0, 16),
    label: `${names.get(row.home_team_id) ?? "Home"} v ${names.get(row.away_team_id) ?? "Away"}`,
    score: scoreLabel(row),
    statusLabel:
      row.status_short === "PST"
        ? "Postponed"
        : row.status_short === "CANC"
          ? "Cancelled"
          : row.status_short === "SUSP"
            ? "Suspended"
            : row.status_short === "ABD"
              ? "Abandoned"
              : null,
  }));
}

type Honour = { league: string | null; country: string | null; season: string | null; place: string | null };
type TransferRow = {
  player_id: number;
  transfer_date: string | null;
  transfer_type: string | null;
  team_in_name: string | null;
  team_out_name: string | null;
};
type FixtureQuery = {
  id: number;
  date: string | null;
  status_short: string | null;
  home_goals: number | null;
  away_goals: number | null;
  score: unknown;
  home_team_id: number;
  away_team_id: number;
};
