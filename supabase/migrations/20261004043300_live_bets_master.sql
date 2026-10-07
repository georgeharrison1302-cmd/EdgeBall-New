CREATE TABLE public.live_bets_master (
  bet_id integer PRIMARY KEY,
  name text,
  bet_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.live_bets_master TO service_role;
GRANT SELECT ON public.live_bets_master TO anon, authenticated;

ALTER TABLE public.live_bets_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_bets_master_select_all
  ON public.live_bets_master
  FOR SELECT
  TO anon, authenticated
  USING (true);
