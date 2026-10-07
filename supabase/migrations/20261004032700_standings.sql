ALTER TABLE public.standings RENAME TO standings_legacy;
ALTER TABLE public.standings_legacy RENAME CONSTRAINT standings_pkey TO standings_legacy_pkey;

CREATE TABLE public.standings (
  league_id integer NOT NULL,
  season integer NOT NULL,
  team_id integer NOT NULL,
  rank integer,
  points integer,
  goals_diff integer,
  form text,
  group_name text,
  status text,
  description text,
  all_stats jsonb,
  home_stats jsonb,
  away_stats jsonb,
  updated_at timestamp with time zone,
  PRIMARY KEY (league_id, season, team_id)
);

INSERT INTO public.standings (
  league_id,
  season,
  team_id,
  rank,
  points,
  goals_diff,
  form,
  group_name,
  status,
  description,
  all_stats,
  home_stats,
  away_stats,
  updated_at
)
SELECT DISTINCT ON (league_id, season, team_id)
  league_id,
  season,
  team_id,
  rank,
  points,
  goals_diff,
  form,
  NULLIF("group", ''),
  status,
  description,
  jsonb_build_object(
    'played', played,
    'win', win,
    'draw', draw,
    'lose', lose,
    'goals', jsonb_build_object(
      'for', goals_for,
      'against', goals_against
    )
  ),
  home,
  away,
  updated
FROM public.standings_legacy
ORDER BY league_id, season, team_id;

DROP TABLE public.standings_legacy;

GRANT SELECT, INSERT, UPDATE ON public.standings TO service_role;
GRANT SELECT ON public.standings TO anon, authenticated;

ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY standings_select_all
  ON public.standings
  FOR SELECT
  TO anon, authenticated
  USING (true);
