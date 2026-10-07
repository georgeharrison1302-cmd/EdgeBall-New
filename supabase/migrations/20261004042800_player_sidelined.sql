CREATE TABLE public.player_sidelined (
  player_id integer NOT NULL,
  type text NOT NULL,
  start_date date,
  end_date date,
  sidelined_data jsonb,
  updated_at timestamp with time zone,
  CONSTRAINT player_sidelined_natural_key UNIQUE NULLS NOT DISTINCT (
    player_id,
    start_date,
    type
  )
);

GRANT SELECT, INSERT, UPDATE ON public.player_sidelined TO service_role;
GRANT SELECT ON public.player_sidelined TO anon, authenticated;

ALTER TABLE public.player_sidelined ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_sidelined_select_all
  ON public.player_sidelined
  FOR SELECT
  TO anon, authenticated
  USING (true);
