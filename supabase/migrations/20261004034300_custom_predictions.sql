CREATE TABLE public.custom_predictions (
  fixture_id integer PRIMARY KEY,
  percent_home integer NOT NULL,
  percent_draw integer NOT NULL,
  percent_away integer NOT NULL,
  xg_home numeric NOT NULL,
  xg_away numeric NOT NULL,
  advice text,
  inputs jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.custom_predictions TO service_role;
GRANT SELECT ON public.custom_predictions TO anon, authenticated;

ALTER TABLE public.custom_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_predictions_select_all
  ON public.custom_predictions
  FOR SELECT
  TO anon, authenticated
  USING (true);
