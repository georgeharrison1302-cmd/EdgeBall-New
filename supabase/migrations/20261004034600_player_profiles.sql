CREATE TABLE public.player_profiles (
  player_id integer PRIMARY KEY,
  name text,
  firstname text,
  lastname text,
  age integer,
  birth_date date,
  nationality text,
  height text,
  weight text,
  photo text,
  player_data jsonb,
  updated_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE ON public.player_profiles TO service_role;
GRANT SELECT ON public.player_profiles TO anon, authenticated;

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_profiles_select_all
  ON public.player_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);
