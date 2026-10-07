CREATE TABLE public.fixture_lineups (
  fixture_id integer NOT NULL,
  team_id integer NOT NULL,
  formation text,
  coach jsonb,
  start_xi jsonb,
  substitutes jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (fixture_id, team_id)
);

GRANT SELECT, INSERT, UPDATE ON public.fixture_lineups TO service_role;
GRANT SELECT ON public.fixture_lineups TO anon, authenticated;

ALTER TABLE public.fixture_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_lineups_select_all
  ON public.fixture_lineups
  FOR SELECT
  TO anon, authenticated
  USING (true);
