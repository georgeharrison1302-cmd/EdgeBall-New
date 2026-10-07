import "server-only";

import { BET365_BOOKMAKER_ID, PREMATCH_PLAYER_CARD_BET_IDS } from "@/utils/api-football/bet-catalogs";
import { parsePlayerPropValue } from "@/utils/odds/player-prop-value";
import { asNumber, asRecord, nestNumber } from "@/utils/pyth";
import { createIngestClient } from "@/utils/supabase/admin";
import { lookupReferee, loadRefereeRates, type StrictRef } from "@/utils/stats/referees";

export type PlayerCardAngle = {
  fixtureId: number;
  match: string;
  odd: number | null;
  modelProb: number | null;
  edgePct: number | null;
  clash: { playerRate: number; opponentRate: number; label: string } | null;
  strictRef: StrictRef | null;
};

export async function loadPlayerCardAngle(
  playerId: number,
  teamIds: number[],
  position: string | null,
  foulsDrawn: number | null,
  appearances: number | null,
): Promise<PlayerCardAngle | null> {
  if (teamIds.length === 0) return null;
  const supabase = createIngestClient();
  const now = new Date().toISOString();
  const [{ data: home }, { data: away }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("id, date, referee, league_id, season, home_team_id, away_team_id, status_short")
      .in("home_team_id", teamIds)
      .in("status_short", ["NS", "TBD"])
      .gte("date", now)
      .order("date")
      .limit(8),
    supabase
      .from("fixtures")
      .select("id, date, referee, league_id, season, home_team_id, away_team_id, status_short")
      .in("away_team_id", teamIds)
      .in("status_short", ["NS", "TBD"])
      .gte("date", now)
      .order("date")
      .limit(8),
  ]);
  return pickPlayerAngle(playerId, teamIds, position, foulsDrawn, appearances, [...(home ?? []), ...(away ?? [])]);
}

async function pickPlayerAngle(
  playerId: number,
  teamIds: number[],
  position: string | null,
  foulsDrawn: number | null,
  appearances: number | null,
  fixtures: Array<{
    id: number;
    date: string | null;
    referee: string | null;
    league_id: number;
    season: number;
    home_team_id: number | null;
    away_team_id: number | null;
    status_short: string | null;
  }>,
): Promise<PlayerCardAngle | null> {
  const next = fixtures
    .filter((fixture) => teamIds.includes(fixture.home_team_id ?? 0) || teamIds.includes(fixture.away_team_id ?? 0))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0];
  if (!next) return null;
  const playerTeamId = teamIds.find((id) => id === next.home_team_id || id === next.away_team_id) ?? null;
  const opponentId =
    playerTeamId === next.home_team_id ? next.away_team_id : playerTeamId === next.away_team_id ? next.home_team_id : null;
  const supabase = createIngestClient();
  const [{ data: teams }, { data: odds }, refs] = await Promise.all([
    supabase.from("teams").select("id, name").in("id", [next.home_team_id, next.away_team_id].filter((id): id is number => id != null)),
    supabase
      .from("prematch_odds")
      .select("bookmaker_id, odds_data, model_prob, edge_pct")
      .eq("fixture_id", next.id)
      .eq("bookmaker_id", BET365_BOOKMAKER_ID)
      .maybeSingle(),
    loadRefereeRates(next.referee ? [next.referee] : []),
  ]);
  const names = new Map((teams ?? []).map((row) => [Number(row.id), row.name]));
  const card = cardValue(odds?.odds_data, playerId, asNumber(odds?.model_prob), asNumber(odds?.edge_pct));
  const playerRate =
    foulsDrawn != null && appearances != null && appearances > 0 ? foulsDrawn / appearances : null;
  const opponentRate = opponentId ? await opponentFoulRate(opponentId, next.league_id, next.season, position) : null;
  const clash =
    playerRate != null && opponentRate != null && playerRate >= 2 && opponentRate >= 2
      ? { playerRate, opponentRate, label: "Fouls drawn vs fouls committed" }
      : null;
  return {
    fixtureId: next.id,
    match: `${names.get(next.home_team_id ?? 0) ?? "Home"} vs ${names.get(next.away_team_id ?? 0) ?? "Away"}`,
    odd: card.odd,
    modelProb: card.modelProb,
    edgePct: card.edgePct,
    clash,
    strictRef: lookupReferee(refs, next.referee),
  };
}

function cardValue(
  oddsData: unknown,
  playerId: number,
  rowModel: number | null = null,
  rowEdge: number | null = null,
) {
  const data = asRecord(oddsData);
  const bets = Array.isArray(data?.bets) ? data.bets : [];
  for (const bet of bets) {
    const row = asRecord(bet);
    const name = String(row?.name ?? "").toLowerCase();
    const id = Number(row?.id);
    if (!(PREMATCH_PLAYER_CARD_BET_IDS as readonly number[]).includes(id) && !name.includes("card") && !name.includes("book")) {
      continue;
    }
    const values = Array.isArray(row?.values) ? row.values : [];
    for (const value of values) {
      const parsed = parsePlayerPropValue(value, null, null);
      if (!parsed || parsed.playerId !== playerId) continue;
      return {
        odd: parsed.odd,
        modelProb: parsed.modelProb,
        edgePct: parsed.edgePct,
      };
    }
  }
  void rowModel;
  void rowEdge;
  return { odd: null, modelProb: null, edgePct: null };
}

async function opponentFoulRate(teamId: number, leagueId: number, season: number, position: string | null) {
  const supabase = createIngestClient();
  const [{ data: squads }, { data: stats }] = await Promise.all([
    supabase.from("team_squads").select("player_id, position").eq("team_id", teamId),
    supabase
      .from("player_season_stats")
      .select("player_id, appearances, stats_data")
      .eq("team_id", teamId)
      .eq("league_id", leagueId)
      .eq("season", season)
      .gt("appearances", 0),
  ]);
  const wanted = opposingLine(position);
  const positions = new Map((squads ?? []).map((row) => [Number(row.player_id), String(row.position ?? "")]));
  const rates: number[] = [];
  for (const row of stats ?? []) {
    const pos = positions.get(Number(row.player_id)) ?? "";
    if (wanted && pos && !wanted.test(pos)) continue;
    const apps = Number(row.appearances);
    const fouls = nestNumber(row.stats_data, "fouls", "committed");
    if (!apps || fouls == null) continue;
    rates.push(fouls / apps);
  }
  if (rates.length === 0) return null;
  return rates.reduce((sum, value) => sum + value, 0) / rates.length;
}

function opposingLine(position: string | null) {
  const value = (position ?? "").toLowerCase();
  if (value.includes("wing") || value.includes("att") || value.includes("forw") || value.includes("forward")) {
    return /def|back/i;
  }
  if (value.includes("def") || value.includes("back")) return /wing|att|forw|mid/i;
  return null;
}
