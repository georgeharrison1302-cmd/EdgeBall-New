CREATE TABLE public.fixture_statistics (
  fixture_id integer NOT NULL,
  team_id integer NOT NULL,
  statistics jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (fixture_id, team_id)
);

GRANT SELECT, INSERT, UPDATE ON public.fixture_statistics TO service_role;
GRANT SELECT ON public.fixture_statistics TO anon, authenticated;

ALTER TABLE public.fixture_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_statistics_select_all
  ON public.fixture_statistics
  FOR SELECT
  TO anon, authenticated
  USING (true);
