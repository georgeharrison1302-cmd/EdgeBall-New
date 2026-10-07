create or replace function public.upcoming_fixtures_feed()
returns table (
  id bigint,
  kickoff_at timestamptz,
  status text,
  league_id bigint,
  league_name text,
  home_team_id bigint,
  home_team_name text,
  away_team_id bigint,
  away_team_name text,
  referee text,
  referee_name text,
  matches_officiated integer,
  avg_yellow_cards numeric,
  avg_red_cards numeric,
  avg_fouls numeric,
  home_rest_hours numeric,
  away_rest_hours numeric,
  fatigue_edge boolean,
  disadvantaged_team text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    fixture.id,
    fixture.kickoff_at,
    coalesce(fixture.status, fixture.status_short) as status,
    fixture.league_id,
    league.name as league_name,
    fixture.home_team_id,
    home.name as home_team_name,
    fixture.away_team_id,
    away.name as away_team_name,
    fixture.referee,
    stats.referee_name,
    stats.matches_officiated,
    stats.avg_yellow_cards,
    stats.avg_red_cards,
    stats.avg_fouls,
    rest.home_rest_hours,
    rest.away_rest_hours,
    rest.fatigue_edge,
    rest.disadvantaged_team
  from public.fixtures as fixture
  join public.leagues as league on league.id = fixture.league_id
  left join public.teams as home on home.id = fixture.home_team_id
  left join public.teams as away on away.id = fixture.away_team_id
  left join public.referee_stats as stats
    on stats.referee_name = public.normalize_referee_name(fixture.referee)
  left join (
    select * from public.calculate_rest_disadvantage((now() at time zone 'utc')::date)
    union all
    select * from public.calculate_rest_disadvantage(((now() at time zone 'utc')::date + 1))
    union all
    select * from public.calculate_rest_disadvantage(((now() at time zone 'utc')::date + 2))
  ) as rest on rest.fixture_id = fixture.id
  where fixture.kickoff_at >= now()
    and fixture.kickoff_at < now() + interval '48 hours'
  order by fixture.kickoff_at, fixture.id;
$$;

revoke all on function public.upcoming_fixtures_feed() from public;
grant execute on function public.upcoming_fixtures_feed() to service_role;
