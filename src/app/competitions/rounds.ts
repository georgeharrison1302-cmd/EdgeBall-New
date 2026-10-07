import "server-only";

import { scoreLabel } from "@/utils/pyth";
import { createAdminClient } from "@/utils/supabase/admin";

export type RoundFixture = {
  id: number;
  kickoff: string;
  day: string;
  time: string;
  status: string | null;
  statusLabel: string | null;
  called: boolean;
  label: string;
  score: string | null;
  home: string;
  away: string;
  homeId: number | null;
  awayId: number | null;
  homeLogo: string | null;
  awayLogo: string | null;
};

export type RoundGroup = {
  name: string;
  current: boolean;
  fixtures: RoundFixture[];
};

const CALLED: Record<string, string> = {
  PST: "Postponed",
  CANC: "Cancelled",
  SUSP: "Suspended",
  ABD: "Abandoned",
};

export async function loadLeagueFixtures(leagueId: number, season: number): Promise<RoundGroup[]> {
  const supabase = createAdminClient();
  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("id, date, status_short, home_goals, away_goals, score, home_team_id, away_team_id")
    .eq("league_id", leagueId)
    .eq("season", season)
    .order("date")
    .limit(1000);
  if (error) throw error;

  const teamIds = [
    ...new Set(
      (fixtures ?? []).flatMap((row) => [row.home_team_id, row.away_team_id]).filter((id): id is number => id != null),
    ),
  ];
  const { data: clubs, error: clubError } = teamIds.length
    ? await supabase.from("teams").select("id, name, logo").in("id", teamIds)
    : { data: [], error: null };
  if (clubError) throw clubError;
  const teams = new Map((clubs ?? []).map((club) => [club.id, club]));

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const groups = new Map<string, RoundFixture[]>();
  for (const row of fixtures ?? []) {
    const kickoff = String(row.date ?? "");
    const day = kickoff.slice(0, 10);
    const name = day >= today ? "Upcoming" : "Results";
    const list = groups.get(name) ?? [];
    const home = teams.get(row.home_team_id ?? 0);
    const away = teams.get(row.away_team_id ?? 0);
    list.push({
      id: row.id,
      kickoff: kickoff.replace("T", " ").slice(0, 16),
      day,
      time: kickoff.slice(11, 16),
      status: row.status_short,
      statusLabel: row.status_short ? CALLED[row.status_short] ?? null : null,
      called: Boolean(row.status_short && row.status_short in CALLED),
      label: `${home?.name ?? "Home"} v ${away?.name ?? "Away"}`,
      score: scoreLabel(row),
      home: home?.name ?? "Home",
      away: away?.name ?? "Away",
      homeId: row.home_team_id,
      awayId: row.away_team_id,
      homeLogo: home?.logo ?? null,
      awayLogo: away?.logo ?? null,
    });
    groups.set(name, list);
  }

  return [...groups.entries()]
    .map(([name, matches]) => ({
      name,
      fixtures: matches,
      sort: matches[0]?.kickoff ?? name,
    }))
    .sort((left, right) => left.sort.localeCompare(right.sort))
    .map(({ name, fixtures: matches }) => ({ name, current: name === "Upcoming", fixtures: matches }));
}
