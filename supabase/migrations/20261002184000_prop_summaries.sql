create table if not exists public.referee_prop_summary (
  referee_name text primary key,
  matches_officiated integer not null,
  avg_yellows numeric(4,2) not null,
  avg_reds numeric(4,2) not null,
  avg_fouls numeric(4,2) not null,
  updated_at timestamptz not null default now()
);

create index if not exists referee_prop_summary_edge_idx
  on public.referee_prop_summary (avg_yellows)
  where matches_officiated >= 10;

create table if not exists public.player_prop_summary (
  player_id bigint primary key references public.players (id) on delete cascade,
  games integer not null,
  avg_shots numeric(6,2) not null,
  avg_shots_on numeric(6,2) not null,
  avg_fouls_committed numeric(6,2) not null,
  avg_fouls_won numeric(6,2) not null,
  avg_tackles numeric(6,2) not null,
  avg_goals numeric(6,2) not null,
  avg_assists numeric(6,2) not null,
  avg_dribbles numeric(6,2) not null,
  avg_dribbled_past numeric(6,2) not null,
  shots smallint[] not null,
  shots_on smallint[] not null,
  fouls_committed smallint[] not null,
  fouls_won smallint[] not null,
  tackles smallint[] not null,
  goals smallint[] not null,
  assists smallint[] not null,
  dribbles smallint[] not null,
  dribbled_past smallint[] not null,
  updated_at timestamptz not null default now()
);

alter table public.referee_prop_summary enable row level security;
alter table public.player_prop_summary enable row level security;

drop policy if exists referee_prop_summary_select_public on public.referee_prop_summary;
create policy referee_prop_summary_select_public
on public.referee_prop_summary
for select
to anon, authenticated
using (true);

drop policy if exists player_prop_summary_select_public on public.player_prop_summary;
create policy player_prop_summary_select_public
on public.player_prop_summary
for select
to anon, authenticated
using (true);

grant select on public.referee_prop_summary, public.player_prop_summary to anon, authenticated;
grant select, insert, update, delete on public.referee_prop_summary, public.player_prop_summary to service_role;

create index if not exists fixture_player_statistics_player_id_idx
  on public.fixture_player_statistics (player_id);

create or replace function public.prop_count(block jsonb, group_name text, field text)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when (block -> group_name ->> field) ~ '^[0-9]+(\.[0-9]+)?$'
      then round((block -> group_name ->> field)::numeric)::smallint
    else 0
  end;
$$;

create or replace function public.refresh_prop_summaries()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored integer;
begin
  perform public.refresh_referee_stats();

  insert into public.referee_prop_summary (
    referee_name,
    matches_officiated,
    avg_yellows,
    avg_reds,
    avg_fouls
  )
  select
    referee_name,
    matches_officiated,
    avg_yellow_cards,
    avg_red_cards,
    avg_fouls
  from public.referee_stats
  on conflict (referee_name) do update
  set matches_officiated = excluded.matches_officiated,
      avg_yellows = excluded.avg_yellows,
      avg_reds = excluded.avg_reds,
      avg_fouls = excluded.avg_fouls,
      updated_at = now();

  delete from public.referee_prop_summary as saved
  where not exists (
    select 1 from public.referee_stats as source
    where source.referee_name = saved.referee_name
  );

  delete from public.player_prop_summary;

  insert into public.player_prop_summary (
    player_id,
    games,
    avg_shots,
    avg_shots_on,
    avg_fouls_committed,
    avg_fouls_won,
    avg_tackles,
    avg_goals,
    avg_assists,
    avg_dribbles,
    avg_dribbled_past,
    shots,
    shots_on,
    fouls_committed,
    fouls_won,
    tackles,
    goals,
    assists,
    dribbles,
    dribbled_past
  )
  with body as (
    select
      sheet.player_id,
      fixture.kickoff_at,
      case
        when jsonb_typeof(sheet.stats) = 'array' then sheet.stats->0
        else sheet.stats
      end as block
    from public.fixture_player_statistics as sheet
    join public.fixtures as fixture on fixture.id = sheet.fixture_id
    where coalesce(sheet.minutes, 0) > 0
  ),
  counted as (
    select
      player_id,
      kickoff_at,
      public.prop_count(block, 'shots', 'total') as shots,
      public.prop_count(block, 'shots', 'on') as shots_on,
      public.prop_count(block, 'fouls', 'committed') as fouls_committed,
      public.prop_count(block, 'fouls', 'drawn') as fouls_won,
      public.prop_count(block, 'tackles', 'total') as tackles,
      public.prop_count(block, 'goals', 'total') as goals,
      public.prop_count(block, 'goals', 'assists') as assists,
      public.prop_count(block, 'dribbles', 'success') as dribbles,
      public.prop_count(block, 'dribbles', 'past') as dribbled_past
    from body
    where block is not null and jsonb_typeof(block) = 'object'
  ),
  recent as (
    select
      counted.*,
      row_number() over (partition by player_id order by kickoff_at desc nulls last) as appearance
    from counted
  )
  select
    player_id,
    count(*)::integer,
    round(avg(shots), 2),
    round(avg(shots_on), 2),
    round(avg(fouls_committed), 2),
    round(avg(fouls_won), 2),
    round(avg(tackles), 2),
    round(avg(goals), 2),
    round(avg(assists), 2),
    round(avg(dribbles), 2),
    round(avg(dribbled_past), 2),
    array_agg(shots order by kickoff_at desc),
    array_agg(shots_on order by kickoff_at desc),
    array_agg(fouls_committed order by kickoff_at desc),
    array_agg(fouls_won order by kickoff_at desc),
    array_agg(tackles order by kickoff_at desc),
    array_agg(goals order by kickoff_at desc),
    array_agg(assists order by kickoff_at desc),
    array_agg(dribbles order by kickoff_at desc),
    array_agg(dribbled_past order by kickoff_at desc)
  from recent
  where appearance <= 10
  group by player_id;

  select count(*) into stored from public.player_prop_summary;
  return stored;
end;
$$;

revoke all on function public.refresh_prop_summaries() from public, anon, authenticated;
grant execute on function public.refresh_prop_summaries() to service_role;

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
    stats.avg_yellows as avg_yellow_cards,
    stats.avg_reds as avg_red_cards,
    stats.avg_fouls,
    rest.home_rest_hours,
    rest.away_rest_hours,
    rest.fatigue_edge,
    rest.disadvantaged_team
  from public.fixtures as fixture
  join public.leagues as league on league.id = fixture.league_id
  left join public.teams as home on home.id = fixture.home_team_id
  left join public.teams as away on away.id = fixture.away_team_id
  left join public.referee_prop_summary as stats
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'referee-stats-nightly') then
    perform cron.unschedule('referee-stats-nightly');
  end if;
  if exists (select 1 from cron.job where jobname = 'prop-summaries-nightly') then
    perform cron.unschedule('prop-summaries-nightly');
  end if;
  perform cron.schedule(
    'prop-summaries-nightly',
    '0 3 * * *',
    'select public.refresh_prop_summaries()'
  );
end;
$$;
