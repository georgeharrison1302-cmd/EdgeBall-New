CREATE TABLE public.player_season_stats (
  player_id integer NOT NULL,
  league_id integer NOT NULL,
  season integer NOT NULL,
  team_id integer NOT NULL,
  appearances integer,
  minutes integer,
  rating numeric,
  goals integer,
  assists integer,
  yellow_cards integer,
  red_cards integer,
  stats_data jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (player_id, league_id, season, team_id)
);

GRANT SELECT, INSERT, UPDATE ON public.player_season_stats TO service_role;
GRANT SELECT ON public.player_season_stats TO anon, authenticated;

ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_season_stats_select_all
  ON public.player_season_stats
  FOR SELECT
  TO anon, authenticated
  USING (true);
