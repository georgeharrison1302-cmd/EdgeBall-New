create or replace function public.calculate_rest_disadvantage(match_date date)
returns table (
  fixture_id bigint,
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
  with slate as (
    select id, kickoff_at, home_team_id, away_team_id
    from public.fixtures
    where kickoff_at >= match_date::timestamptz
      and kickoff_at < (match_date + 1)::timestamptz
      and kickoff_at is not null
      and home_team_id is not null
      and away_team_id is not null
  ),
  rest as (
    select
      slate.id as fixture_id,
      (
        select extract(epoch from (slate.kickoff_at - previous.kickoff_at)) / 3600
        from public.fixtures as previous
        where previous.id <> slate.id
          and previous.kickoff_at < slate.kickoff_at
          and previous.kickoff_at is not null
          and previous.status_short in ('FT', 'AET', 'PEN', 'AWD', 'WO')
          and (
            previous.home_team_id = slate.home_team_id
            or previous.away_team_id = slate.home_team_id
          )
        order by previous.kickoff_at desc
        limit 1
      ) as home_rest_hours,
      (
        select extract(epoch from (slate.kickoff_at - previous.kickoff_at)) / 3600
        from public.fixtures as previous
        where previous.id <> slate.id
          and previous.kickoff_at < slate.kickoff_at
          and previous.kickoff_at is not null
          and previous.status_short in ('FT', 'AET', 'PEN', 'AWD', 'WO')
          and (
            previous.home_team_id = slate.away_team_id
            or previous.away_team_id = slate.away_team_id
          )
        order by previous.kickoff_at desc
        limit 1
      ) as away_rest_hours
    from slate
  )
  select
    fixture_id,
    home_rest_hours,
    away_rest_hours,
    coalesce(
      (home_rest_hours > 144 and away_rest_hours < 72)
      or (away_rest_hours > 144 and home_rest_hours < 72),
      false
    ) as fatigue_edge,
    case
      when home_rest_hours > 144 and away_rest_hours < 72 then 'Away'
      when away_rest_hours > 144 and home_rest_hours < 72 then 'Home'
      else null
    end as disadvantaged_team
  from rest;
$$;

revoke all on function public.calculate_rest_disadvantage(date) from public, anon, authenticated;
grant execute on function public.calculate_rest_disadvantage(date) to service_role;

drop function if exists public.upcoming_fixtures(date);

create function public.upcoming_fixtures(match_date date)
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
  total_matches integer,
  avg_yellows numeric,
  avg_reds numeric,
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
    stats.total_matches,
    stats.avg_yellows,
    stats.avg_reds,
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
    on stats.referee_name = btrim(fixture.referee)
  left join public.calculate_rest_disadvantage(match_date) as rest
    on rest.fixture_id = fixture.id
  where fixture.kickoff_at >= match_date::timestamptz
    and fixture.kickoff_at < (match_date + 1)::timestamptz
  order by fixture.kickoff_at, fixture.id;
$$;

revoke all on function public.upcoming_fixtures(date) from public;
grant execute on function public.upcoming_fixtures(date) to service_role;
