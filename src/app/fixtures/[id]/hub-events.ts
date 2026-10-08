import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";

export type FixtureEvent = {
  id: number;
  teamId: number | null;
  /** Display minute label, e.g. "23'" or "90+2'". */
  minute: string;
  elapsed: number;
  extra: number | null;
  type: string;
  detail: string;
  playerName: string | null;
  assistName: string | null;
};

export type FixtureProjection = {
  home: number;
  draw: number;
  away: number;
  xgHome: number | null;
  xgAway: number | null;
  advice: string | null;
};

/** In-house model projection (custom_predictions) for this fixture. */
export async function loadFixtureProjection(fixtureId: number): Promise<FixtureProjection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("custom_predictions")
    .select("percent_home, percent_draw, percent_away, xg_home, xg_away, advice")
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    home: Number(data.percent_home),
    draw: Number(data.percent_draw),
    away: Number(data.percent_away),
    xgHome: data.xg_home == null ? null : Number(data.xg_home),
    xgAway: data.xg_away == null ? null : Number(data.xg_away),
    advice: data.advice ?? null,
  };
}

export type FixtureXg = { teamId: number; xg: number };

/** Per-team expected goals from fixture_statistics for this fixture. */
export async function loadFixtureXg(fixtureId: number): Promise<FixtureXg[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_statistics")
    .select("team_id, statistics")
    .eq("fixture_id", fixtureId);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const stats = row.statistics as Record<string, unknown> | null;
    const raw = stats?.expected_goals;
    const xg = raw == null ? null : Number(raw);
    if (xg == null || !Number.isFinite(xg)) return [];
    return [{ teamId: Number(row.team_id), xg }];
  });
}

/** Match timeline from fixture_events, ordered by minute then insertion order. */
export async function loadFixtureEvents(fixtureId: number): Promise<FixtureEvent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fixture_events")
    .select("id, team_id, time_elapsed, time_extra, type, detail, player_name, assist_name")
    .eq("fixture_id", fixtureId)
    .order("time_elapsed", { ascending: true })
    .order("time_extra", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const elapsed = Number(row.time_elapsed ?? 0);
    const extra = row.time_extra != null ? Number(row.time_extra) : null;
    return {
      id: Number(row.id),
      teamId: row.team_id != null ? Number(row.team_id) : null,
      minute: `${elapsed}${extra ? `+${extra}` : ""}'`,
      elapsed,
      extra,
      type: String(row.type ?? ""),
      detail: String(row.detail ?? ""),
      playerName: row.player_name ?? null,
      assistName: row.assist_name ?? null,
    };
  });
}
