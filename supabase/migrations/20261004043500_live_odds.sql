CREATE TABLE public.live_odds (
  fixture_id integer NOT NULL,
  league_id integer,
  bookmaker_id integer NOT NULL,
  bookmaker_name text,
  status jsonb,
  odds_data jsonb,
  updated_at timestamp with time zone,
  CONSTRAINT live_odds_natural_key UNIQUE (fixture_id, bookmaker_id)
);

GRANT SELECT, INSERT, UPDATE ON public.live_odds TO service_role;
GRANT SELECT ON public.live_odds TO anon, authenticated;

ALTER TABLE public.live_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_odds_select_all
  ON public.live_odds
  FOR SELECT
  TO anon, authenticated
  USING (true);
