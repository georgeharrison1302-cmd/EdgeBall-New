CREATE TABLE public.fixture_events (
  id serial PRIMARY KEY,
  fixture_id integer NOT NULL,
  team_id integer,
  time_elapsed integer,
  time_extra integer,
  type text,
  detail text,
  player_id integer,
  player_name text,
  assist_id integer,
  assist_name text,
  comments text,
  event_data jsonb,
  CONSTRAINT fixture_events_natural_key UNIQUE NULLS NOT DISTINCT (
    fixture_id,
    team_id,
    time_elapsed,
    time_extra,
    type,
    detail,
    player_id,
    assist_id
  )
);

GRANT SELECT, INSERT, UPDATE ON public.fixture_events TO service_role;
GRANT SELECT ON public.fixture_events TO anon, authenticated;

ALTER TABLE public.fixture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_events_select_all
  ON public.fixture_events
  FOR SELECT
  TO anon, authenticated
  USING (true);
