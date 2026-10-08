import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/utils/supabase/admin";

export type ModelWatchTip = {
  tipKey: string;
  fixtureId: number;
  home: string;
  away: string;
  market: string;
  selection: string;
  odds: number;
  edgePct: number;
  modelProb: number;
  kickoff: string | null;
};

/** Same guardrails as the hardened model: reject implausible edges/longshots. */
const EDGE_CAP_PCT = 40;
const ODDS_CAP = 8;

/** Pending model tips kicking off within the next 48h, best edge first. */
export const loadModelWatch = cache(async (limit = 6): Promise<ModelWatchTip[]> => {
  const supabase = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3_600_000);

  const { data: tips, error } = await supabase
    .from("model_tips")
    .select("tip_key, fixture_id, market, selection, odds, edge_pct, model_prob, kickoff")
    .eq("status", "pending")
    .gt("edge_pct", 0)
    .lte("edge_pct", EDGE_CAP_PCT)
    .lte("odds", ODDS_CAP)
    .gte("kickoff", now.toISOString())
    .lte("kickoff", horizon.toISOString())
    .order("edge_pct", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!tips || tips.length === 0) return [];

  const fixtureIds = [...new Set(tips.map((tip) => Number(tip.fixture_id)))];
  const { data: fixtures, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id")
    .in("id", fixtureIds);
  if (fixtureError) throw fixtureError;

  const teamIds = [
    ...new Set(
      (fixtures ?? []).flatMap((row) => [Number(row.home_team_id), Number(row.away_team_id)]),
    ),
  ];
  const { data: teams, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds);
  if (teamError) throw teamError;

  const teamName = new Map((teams ?? []).map((team) => [Number(team.id), String(team.name)]));
  const fixtureTeams = new Map(
    (fixtures ?? []).map((row) => [
      Number(row.id),
      {
        home: teamName.get(Number(row.home_team_id)) ?? "Home",
        away: teamName.get(Number(row.away_team_id)) ?? "Away",
      },
    ]),
  );

  return tips.flatMap((tip) => {
    const names = fixtureTeams.get(Number(tip.fixture_id));
    if (!names) return [];
    return [
      {
        tipKey: String(tip.tip_key),
        fixtureId: Number(tip.fixture_id),
        home: names.home,
        away: names.away,
        market: String(tip.market),
        selection: String(tip.selection),
        odds: Number(tip.odds),
        edgePct: Number(tip.edge_pct),
        modelProb: Number(tip.model_prob),
        kickoff: tip.kickoff,
      },
    ];
  });
});
