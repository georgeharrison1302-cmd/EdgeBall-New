CREATE TABLE public.bookmakers (
  bookmaker_id integer PRIMARY KEY,
  name text,
  bookmaker_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.bookmakers TO service_role;
GRANT SELECT ON public.bookmakers TO anon, authenticated;

ALTER TABLE public.bookmakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmakers_select_all
  ON public.bookmakers
  FOR SELECT
  TO anon, authenticated
  USING (true);
