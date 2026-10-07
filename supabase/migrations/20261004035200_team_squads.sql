CREATE TABLE public.team_squads (
  team_id integer NOT NULL,
  player_id integer NOT NULL,
  player_name text,
  age integer,
  number integer,
  position text,
  photo text,
  updated_at timestamp with time zone,
  PRIMARY KEY (team_id, player_id)
);

GRANT SELECT, INSERT, UPDATE ON public.team_squads TO service_role;
GRANT SELECT ON public.team_squads TO anon, authenticated;

ALTER TABLE public.team_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_squads_select_all
  ON public.team_squads
  FOR SELECT
  TO anon, authenticated
  USING (true);
