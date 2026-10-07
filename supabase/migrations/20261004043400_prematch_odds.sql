CREATE TABLE public.prematch_odds (
  fixture_id integer NOT NULL,
  league_id integer,
  season integer,
  bookmaker_id integer NOT NULL,
  bookmaker_name text,
  odds_data jsonb,
  updated_at timestamp with time zone,
  CONSTRAINT prematch_odds_natural_key UNIQUE (fixture_id, bookmaker_id)
);

GRANT SELECT, INSERT, UPDATE ON public.prematch_odds TO service_role;
GRANT SELECT ON public.prematch_odds TO anon, authenticated;

ALTER TABLE public.prematch_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY prematch_odds_select_all
  ON public.prematch_odds
  FOR SELECT
  TO anon, authenticated
  USING (true);
