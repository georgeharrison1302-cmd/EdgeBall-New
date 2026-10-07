CREATE TABLE public.fixture_injuries (
  fixture_id integer NOT NULL,
  team_id integer,
  player_id integer NOT NULL,
  player_name text,
  player_photo text,
  type text,
  reason text,
  updated_at timestamp with time zone,
  PRIMARY KEY (fixture_id, player_id)
);

GRANT SELECT, INSERT, UPDATE ON public.fixture_injuries TO service_role;
GRANT SELECT ON public.fixture_injuries TO anon, authenticated;

ALTER TABLE public.fixture_injuries ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_injuries_select_all
  ON public.fixture_injuries
  FOR SELECT
  TO anon, authenticated
  USING (true);
