CREATE TABLE public.player_teams_history (
  player_id integer NOT NULL,
  team_id integer NOT NULL,
  team_name text,
  team_logo text,
  seasons integer[],
  teams_data jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (player_id, team_id)
);

GRANT SELECT, INSERT, UPDATE ON public.player_teams_history TO service_role;
GRANT SELECT ON public.player_teams_history TO anon, authenticated;

ALTER TABLE public.player_teams_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_teams_history_select_all
  ON public.player_teams_history
  FOR SELECT
  TO anon, authenticated
  USING (true);
