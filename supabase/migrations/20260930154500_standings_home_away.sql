alter table public.standings
  add column if not exists home_played integer,
  add column if not exists home_win integer,
  add column if not exists home_draw integer,
  add column if not exists home_lose integer,
  add column if not exists home_goals_for integer,
  add column if not exists home_goals_against integer,
  add column if not exists away_played integer,
  add column if not exists away_win integer,
  add column if not exists away_draw integer,
  add column if not exists away_lose integer,
  add column if not exists away_goals_for integer,
  add column if not exists away_goals_against integer,
  add column if not exists api_updated_at timestamptz;

update public.standings
set
  home_played = coalesce(home_played, nullif(home->>'played', '')::integer),
  home_win = coalesce(home_win, nullif(home->>'win', '')::integer),
  home_draw = coalesce(home_draw, nullif(home->>'draw', '')::integer),
  home_lose = coalesce(home_lose, nullif(home->>'lose', '')::integer),
  home_goals_for = coalesce(home_goals_for, nullif(home->'goals'->>'for', '')::integer),
  home_goals_against = coalesce(home_goals_against, nullif(home->'goals'->>'against', '')::integer),
  away_played = coalesce(away_played, nullif(away->>'played', '')::integer),
  away_win = coalesce(away_win, nullif(away->>'win', '')::integer),
  away_draw = coalesce(away_draw, nullif(away->>'draw', '')::integer),
  away_lose = coalesce(away_lose, nullif(away->>'lose', '')::integer),
  away_goals_for = coalesce(away_goals_for, nullif(away->'goals'->>'for', '')::integer),
  away_goals_against = coalesce(away_goals_against, nullif(away->'goals'->>'against', '')::integer),
  api_updated_at = coalesce(
    api_updated_at,
    nullif(payload->>'update', '')::timestamptz
  );
