CREATE TABLE public.fixtures_h2h (
  id integer PRIMARY KEY,
  team1_id integer,
  team2_id integer,
  fixture_date timestamp with time zone,
  match_data jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.fixtures_h2h TO service_role;
GRANT SELECT ON public.fixtures_h2h TO anon, authenticated;

ALTER TABLE public.fixtures_h2h ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixtures_h2h_select_all
  ON public.fixtures_h2h
  FOR SELECT
  TO anon, authenticated
  USING (true);
