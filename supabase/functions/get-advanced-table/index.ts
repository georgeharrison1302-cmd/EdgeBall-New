import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET") return json({ success: false, reason: "GET only" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ success: false, reason: "Missing Supabase credentials" }, 500);

  const requestUrl = new URL(request.url);
  const league = Number(requestUrl.searchParams.get("league") ?? "39");
  const seasonParam = requestUrl.searchParams.get("season");
  if (!Number.isInteger(league) || league <= 0) return json({ success: false, reason: "league must be an id" }, 400);

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let season = seasonParam == null ? null : Number(seasonParam);
  if (seasonParam != null && !Number.isInteger(season)) return json({ success: false, reason: "season must be a year" }, 400);
  if (season == null) {
    const { data, error } = await supabase.from("league_seasons").select("season").eq("league_id", league).eq("is_current", true).maybeSingle();
    if (error) return json({ success: false, reason: error.message }, 500);
    season = data?.season ?? null;
  }
  if (season == null) return json({ success: false, reason: "No season stored for this league" }, 404);

  const { data, error } = await supabase
    .from("league_table_advanced")
    .select("team_id, team_name, logo_url, rank, played, wins, draws, losses, points, avg_xg_for, avg_xg_against, avg_corners_home, avg_corners_away, total_corners_avg, btts_hit_rate_pct, over_2_half_hit_rate_pct")
    .eq("league_id", league)
    .eq("season", season)
    .order("rank", { ascending: true, nullsFirst: false });
  if (error) return json({ success: false, reason: error.message }, 500);

  return json({ league, season, rows: data ?? [] }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
