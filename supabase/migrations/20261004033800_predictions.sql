CREATE TABLE public.predictions (
  fixture_id integer PRIMARY KEY,
  winner jsonb,
  win_or_draw boolean,
  under_over text,
  goals jsonb,
  advice text,
  percent jsonb,
  comparison jsonb,
  teams jsonb,
  h2h jsonb,
  prediction_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.predictions TO service_role;
GRANT SELECT ON public.predictions TO anon, authenticated;

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY predictions_select_all
  ON public.predictions
  FOR SELECT
  TO anon, authenticated
  USING (true);
