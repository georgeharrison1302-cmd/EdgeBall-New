create or replace function public.normalize_referee_name(raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(split_part(btrim(coalesce(raw, '')), ',', 1)), '');
$$;

alter table public.referee_stats add column if not exists id uuid default gen_random_uuid();
update public.referee_stats set id = gen_random_uuid() where id is null;
alter table public.referee_stats alter column id set not null;

alter table public.referee_stats drop constraint if exists referee_stats_pkey;
alter table public.referee_stats add constraint referee_stats_pkey primary key (id);

alter table public.referee_stats rename column total_matches to matches_officiated;
alter table public.referee_stats rename column avg_yellows to avg_yellow_cards;
alter table public.referee_stats rename column avg_reds to avg_red_cards;

alter table public.referee_stats
  alter column avg_yellow_cards type numeric(4,2) using round(avg_yellow_cards, 2),
  alter column avg_red_cards type numeric(4,2) using round(avg_red_cards, 2),
  alter column avg_fouls type numeric(4,2) using round(avg_fouls, 2);

alter table public.referee_stats drop constraint if exists referee_stats_referee_name_key;
alter table public.referee_stats add constraint referee_stats_referee_name_key unique (referee_name);

create or replace function public.refresh_referee_stats()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored integer;
begin
  with finished as (
    select
      id,
      public.normalize_referee_name(referee) as referee_name
    from public.fixtures
    where coalesce(status, status_short) = 'FT'
      and public.normalize_referee_name(referee) is not null
  ),
  sides as (
    select
      finished.referee_name,
      stats.fixture_id,
      public.fixture_stat_number(stats.stats, 'Yellow Cards') as yellows,
      public.fixture_stat_number(stats.stats, 'Red Cards') as reds,
      public.fixture_stat_number(stats.stats, 'Fouls') as fouls
    from finished
    join public.fixture_statistics as stats
      on stats.fixture_id = finished.id
     and stats.period = 'FT'
  ),
  matches as (
    select
      referee_name,
      fixture_id,
      sum(yellows) as yellows,
      sum(reds) as reds,
      sum(fouls) as fouls
    from sides
    group by referee_name, fixture_id
  ),
  computed as (
    select
      referee_name,
      count(*)::integer as matches_officiated,
      round(sum(yellows) / count(*), 2)::numeric(4,2) as avg_yellow_cards,
      round(sum(reds) / count(*), 2)::numeric(4,2) as avg_red_cards,
      round(sum(fouls) / count(*), 2)::numeric(4,2) as avg_fouls
    from matches
    group by referee_name
  ),
  upserted as (
    insert into public.referee_stats (
      referee_name,
      matches_officiated,
      avg_yellow_cards,
      avg_red_cards,
      avg_fouls
    )
    select referee_name, matches_officiated, avg_yellow_cards, avg_red_cards, avg_fouls
    from computed
    on conflict (referee_name) do update
    set matches_officiated = excluded.matches_officiated,
        avg_yellow_cards = excluded.avg_yellow_cards,
        avg_red_cards = excluded.avg_red_cards,
        avg_fouls = excluded.avg_fouls,
        updated_at = now()
    returning 1
  )
  select count(*) into stored from upserted;

  delete from public.referee_stats as saved
  where not exists (
    select 1
    from public.fixtures as fixture
    join public.fixture_statistics as stats
      on stats.fixture_id = fixture.id
     and stats.period = 'FT'
    where coalesce(fixture.status, fixture.status_short) = 'FT'
      and public.normalize_referee_name(fixture.referee) = saved.referee_name
  );

  return stored;
end;
$$;

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
  left join public.calculate_rest_disadvantage(match_date) as rest
    on rest.fixture_id = fixture.id
  where fixture.kickoff_at >= match_date::timestamptz
    and fixture.kickoff_at < (match_date + 1)::timestamptz
  order by fixture.kickoff_at, fixture.id;
$$;

revoke all on function public.upcoming_fixtures(date) from public;
grant execute on function public.upcoming_fixtures(date) to service_role;
