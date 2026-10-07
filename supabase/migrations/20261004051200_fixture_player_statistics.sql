CREATE TABLE IF NOT EXISTS public.ingest_checkpoints (
  id text PRIMARY KEY,
  resource text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_status text,
  last_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ingest_checkpoints TO service_role;

CREATE TABLE public.fixture_player_statistics (
  fixture_id integer NOT NULL,
  team_id integer NOT NULL,
  player_id integer NOT NULL,
  player_name text,
  statistics jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (fixture_id, team_id, player_id)
);

CREATE INDEX fixture_player_statistics_fixture_id_idx
  ON public.fixture_player_statistics (fixture_id);

GRANT SELECT, INSERT, UPDATE ON public.fixture_player_statistics TO service_role;
GRANT SELECT ON public.fixture_player_statistics TO anon, authenticated;

ALTER TABLE public.fixture_player_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixture_player_statistics_select_all
  ON public.fixture_player_statistics
  FOR SELECT
  TO anon, authenticated
  USING (true);
