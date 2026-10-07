CREATE TABLE public.player_trophies (
  player_id integer NOT NULL,
  league text NOT NULL,
  country text,
  season text,
  place text,
  trophy_data jsonb,
  updated_at timestamp with time zone,
  CONSTRAINT player_trophies_natural_key UNIQUE NULLS NOT DISTINCT (
    player_id,
    league,
    season,
    place
  )
);

GRANT SELECT, INSERT, UPDATE ON public.player_trophies TO service_role;
GRANT SELECT ON public.player_trophies TO anon, authenticated;

ALTER TABLE public.player_trophies ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_trophies_select_all
  ON public.player_trophies
  FOR SELECT
  TO anon, authenticated
  USING (true);
