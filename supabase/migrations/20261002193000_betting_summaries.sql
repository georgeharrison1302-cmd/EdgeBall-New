create table if not exists public.referee_summary (
  referee_name text primary key,
  matches_officiated integer not null,
  avg_yellow_cards numeric(4,2) not null,
  updated_at timestamptz not null default now()
);

create index if not exists referee_summary_edge_idx
  on public.referee_summary (avg_yellow_cards)
  where matches_officiated >= 10;

alter table public.player_prop_summary add column if not exists team_id bigint;
alter table public.player_prop_summary add column if not exists matches_played integer;

create index if not exists player_prop_summary_team_fouls_idx
  on public.player_prop_summary (team_id, avg_fouls_committed)
  where matches_played >= 10;

alter table public.referee_summary enable row level security;
drop policy if exists referee_summary_select_public on public.referee_summary;
create policy referee_summary_select_public
on public.referee_summary
for select
to anon, authenticated
using (true);
grant select on public.referee_summary to anon, authenticated;
grant select, insert, update, delete on public.referee_summary to service_role;

create or replace function public.refresh_betting_summaries()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored integer;
begin
  with cards as (
    select
      fixture.id as fixture_id,
      public.normalize_referee_name(fixture.referee) as referee_name,
      public.prop_count(
        case when jsonb_typeof(sheet.stats) = 'array' then sheet.stats->0 else sheet.stats end,
        'cards',
        'yellow'
      ) as yellows
    from public.fixtures as fixture
    join public.fixture_player_statistics as sheet on sheet.fixture_id = fixture.id
    where coalesce(fixture.status, fixture.status_short) = 'FT'
      and public.normalize_referee_name(fixture.referee) is not null
  ),
  per_match as (
    select referee_name, fixture_id, sum(yellows) as yellows
    from cards
    group by referee_name, fixture_id
  ),
  computed as (
    select
      referee_name,
      count(*)::integer as matches_officiated,
      round(avg(yellows), 2)::numeric(4,2) as avg_yellow_cards
    from per_match
    group by referee_name
  ),
  upserted as (
    insert into public.referee_summary (referee_name, matches_officiated, avg_yellow_cards)
    select referee_name, matches_officiated, avg_yellow_cards
    from computed
    on conflict (referee_name) do update
    set matches_officiated = excluded.matches_officiated,
        avg_yellow_cards = excluded.avg_yellow_cards,
        updated_at = now()
    returning 1
  )
  select count(*) into stored from upserted;

  delete from public.referee_summary as saved
  where not exists (
    select 1
    from public.fixtures as fixture
    join public.fixture_player_statistics as sheet on sheet.fixture_id = fixture.id
    where coalesce(fixture.status, fixture.status_short) = 'FT'
      and public.normalize_referee_name(fixture.referee) = saved.referee_name
  );

  with played as (
    select
      sheet.player_id,
      sheet.team_id,
      fixture.kickoff_at,
      public.prop_count(
        case when jsonb_typeof(sheet.stats) = 'array' then sheet.stats->0 else sheet.stats end,
        'fouls',
        'committed'
      ) as fouls
    from public.fixture_player_statistics as sheet
    join public.fixtures as fixture on fixture.id = sheet.fixture_id
    where sheet.minutes >= 45
      and sheet.team_id is not null
  ),
  latest_team as (
    select distinct on (player_id) player_id, team_id
    from played
    order by player_id, kickoff_at desc nulls last
  ),
  fouls as (
    select
      player_id,
      count(*)::integer as matches_played,
      round(avg(fouls), 2)::numeric(4,2) as avg_fouls_committed
    from played
    group by player_id
  )
  insert into public.player_prop_summary (
    player_id,
    team_id,
    matches_played,
    avg_fouls_committed,
    games,
    avg_shots,
    avg_shots_on,
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
  select
    fouls.player_id,
    latest_team.team_id,
    fouls.matches_played,
    fouls.avg_fouls_committed,
    fouls.matches_played,
    0, 0, 0, 0, 0, 0, 0, 0,
    '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}'
  from fouls
  join latest_team on latest_team.player_id = fouls.player_id
  on conflict (player_id) do update
  set team_id = excluded.team_id,
      matches_played = excluded.matches_played,
      avg_fouls_committed = excluded.avg_fouls_committed,
      updated_at = now();

  return stored;
end;
$$;

revoke all on function public.refresh_betting_summaries() from public, anon, authenticated;
grant execute on function public.refresh_betting_summaries() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prop-summaries-nightly') then
    perform cron.unschedule('prop-summaries-nightly');
  end if;
  if exists (select 1 from cron.job where jobname = 'betting-summaries-nightly') then
    perform cron.unschedule('betting-summaries-nightly');
  end if;
  perform cron.schedule(
    'betting-summaries-nightly',
    '0 3 * * *',
    'select public.refresh_betting_summaries()'
  );
end;
$$;
