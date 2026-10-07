CREATE TABLE public.bets_master (
  bet_id integer PRIMARY KEY,
  name text,
  bet_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.bets_master TO service_role;
GRANT SELECT ON public.bets_master TO anon, authenticated;

ALTER TABLE public.bets_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY bets_master_select_all
  ON public.bets_master
  FOR SELECT
  TO anon, authenticated
  USING (true);
