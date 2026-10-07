CREATE TABLE public.odds_mapping (
  fixture_id integer PRIMARY KEY,
  league_id integer,
  season integer,
  fixture_date timestamp with time zone,
  fixture_timestamp bigint,
  update_time timestamp with time zone,
  mapping_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.odds_mapping TO service_role;
GRANT SELECT ON public.odds_mapping TO anon, authenticated;

ALTER TABLE public.odds_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY odds_mapping_select_all
  ON public.odds_mapping
  FOR SELECT
  TO anon, authenticated
  USING (true);
