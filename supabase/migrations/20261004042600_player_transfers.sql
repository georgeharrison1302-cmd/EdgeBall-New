CREATE TABLE public.player_transfers (
  player_id integer NOT NULL,
  transfer_date date NOT NULL,
  transfer_type text,
  team_in_id integer,
  team_in_name text,
  team_out_id integer,
  team_out_name text,
  transfer_data jsonb,
  updated_at timestamp with time zone,
  CONSTRAINT player_transfers_natural_key UNIQUE NULLS NOT DISTINCT (
    player_id,
    transfer_date,
    team_in_id,
    team_out_id
  )
);

GRANT SELECT, INSERT, UPDATE ON public.player_transfers TO service_role;
GRANT SELECT ON public.player_transfers TO anon, authenticated;

ALTER TABLE public.player_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_transfers_select_all
  ON public.player_transfers
  FOR SELECT
  TO anon, authenticated
  USING (true);
