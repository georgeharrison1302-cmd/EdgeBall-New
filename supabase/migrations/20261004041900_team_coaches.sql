CREATE TABLE public.team_coaches (
  team_id integer NOT NULL,
  coach_id integer NOT NULL,
  name text,
  firstname text,
  lastname text,
  age integer,
  nationality text,
  photo text,
  career jsonb,
  coach_data jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (team_id, coach_id)
);

GRANT SELECT, INSERT, UPDATE ON public.team_coaches TO service_role;
GRANT SELECT ON public.team_coaches TO anon, authenticated;

ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_coaches_select_all
  ON public.team_coaches
  FOR SELECT
  TO anon, authenticated
  USING (true);
