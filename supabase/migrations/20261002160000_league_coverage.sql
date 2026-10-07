alter table public.leagues
  add column if not exists coverage jsonb;

update public.leagues as league
set coverage = season.coverage
from public.league_seasons as season
where season.league_id = league.id
  and season.is_current
  and season.coverage is not null;
