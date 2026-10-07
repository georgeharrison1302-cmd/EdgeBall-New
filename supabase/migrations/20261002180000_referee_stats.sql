create table if not exists public.referee_stats (
  referee_name text primary key,
  total_matches integer not null,
  avg_yellows numeric not null,
  avg_reds numeric not null,
  avg_fouls numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.referee_stats;
create trigger set_updated_at
before update on public.referee_stats
for each row execute procedure public.set_updated_at();

alter table public.referee_stats enable row level security;

drop policy if exists referee_stats_select_public on public.referee_stats;
create policy referee_stats_select_public
on public.referee_stats
for select
to anon, authenticated
using (true);

grant select on public.referee_stats to anon, authenticated;
grant select, insert, update, delete on public.referee_stats to service_role;

create index if not exists fixtures_referee_idx on public.fixtures (referee);

-- A counting stat stored as null, or omitted from the sheet, counts as 0.
-- A match with no FT statistics sheet is left out of the average.
create or replace function public.fixture_stat_number(stats jsonb, label text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when stats is null or jsonb_typeof(stats) <> 'object' then 0
    when stats->label is null or jsonb_typeof(stats->label) = 'null' then 0
    when jsonb_typeof(stats->label) = 'number' then (stats->>label)::numeric
    when jsonb_typeof(stats->label) = 'string'
      and (stats->>label) ~ '^[0-9]+(\.[0-9]+)?$' then (stats->>label)::numeric
    else 0
  end;
$$;

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
    select id, btrim(referee) as referee_name
    from public.fixtures
    where status_short in ('FT', 'AET', 'PEN', 'AWD', 'WO')
      and referee is not null
      and btrim(referee) <> ''
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
      count(*)::integer as total_matches,
      sum(yellows) / count(*) as avg_yellows,
      sum(reds) / count(*) as avg_reds,
      sum(fouls) / count(*) as avg_fouls
    from matches
    group by referee_name
  ),
  upserted as (
    insert into public.referee_stats (referee_name, total_matches, avg_yellows, avg_reds, avg_fouls)
    select referee_name, total_matches, avg_yellows, avg_reds, avg_fouls
    from computed
    on conflict (referee_name) do update
    set total_matches = excluded.total_matches,
        avg_yellows = excluded.avg_yellows,
        avg_reds = excluded.avg_reds,
        avg_fouls = excluded.avg_fouls
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
    where fixture.status_short in ('FT', 'AET', 'PEN', 'AWD', 'WO')
      and btrim(fixture.referee) = saved.referee_name
  );

  return stored;
end;
$$;

revoke all on function public.refresh_referee_stats() from public, anon, authenticated;
grant execute on function public.refresh_referee_stats() to service_role;

create or replace function public.upcoming_fixtures(match_date date)
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
  avg_fouls numeric
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
    stats.avg_fouls
  from public.fixtures as fixture
  join public.leagues as league on league.id = fixture.league_id
  left join public.teams as home on home.id = fixture.home_team_id
  left join public.teams as away on away.id = fixture.away_team_id
  left join public.referee_stats as stats
    on stats.referee_name = btrim(fixture.referee)
  where fixture.kickoff_at >= match_date::timestamptz
    and fixture.kickoff_at < (match_date + 1)::timestamptz
  order by fixture.kickoff_at, fixture.id;
$$;

revoke all on function public.upcoming_fixtures(date) from public;
grant execute on function public.upcoming_fixtures(date) to service_role;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing bigint;
begin
  if exists (select 1 from cron.job where jobname = 'referee-stats-nightly') then
    perform cron.unschedule('referee-stats-nightly');
  end if;
  perform cron.schedule(
    'referee-stats-nightly',
    '15 3 * * *',
    'select public.refresh_referee_stats()'
  );
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron is not available in this database';
end;
$$;
