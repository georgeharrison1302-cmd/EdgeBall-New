create table if not exists public.player_prop_stats (
  player_id bigint not null references public.players (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  matches_played integer not null,
  avg_shots_on_target numeric(5,2) not null,
  avg_fouls numeric(5,2) not null,
  hit_rate_sot_pct numeric(5,2) not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, team_id)
);

create index if not exists player_prop_stats_team_edge_idx
  on public.player_prop_stats (team_id, hit_rate_sot_pct)
  where matches_played >= 10;

alter table public.player_prop_stats enable row level security;

drop policy if exists player_prop_stats_select_public on public.player_prop_stats;
create policy player_prop_stats_select_public
on public.player_prop_stats
for select
to anon, authenticated
using (true);

grant select on public.player_prop_stats to anon, authenticated;
grant select, insert, update, delete on public.player_prop_stats to service_role;

create or replace function public.refresh_player_prop_stats()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored integer;
begin
  with played as (
    select
      sheet.player_id,
      sheet.team_id,
      public.prop_count(
        case when jsonb_typeof(sheet.stats) = 'array' then sheet.stats->0 else sheet.stats end,
        'shots',
        'on'
      ) as shots_on_target,
      public.prop_count(
        case when jsonb_typeof(sheet.stats) = 'array' then sheet.stats->0 else sheet.stats end,
        'fouls',
        'committed'
      ) as fouls
    from public.fixture_player_statistics as sheet
    where sheet.minutes > 45
      and sheet.team_id is not null
  ),
  computed as (
    select
      player_id,
      team_id,
      count(*)::integer as matches_played,
      round(avg(shots_on_target), 2)::numeric(5,2) as avg_shots_on_target,
      round(avg(fouls), 2)::numeric(5,2) as avg_fouls,
      round(100.0 * count(*) filter (where shots_on_target >= 1) / count(*), 2)::numeric(5,2) as hit_rate_sot_pct
    from played
    group by player_id, team_id
  ),
  upserted as (
    insert into public.player_prop_stats (
      player_id,
      team_id,
      matches_played,
      avg_shots_on_target,
      avg_fouls,
      hit_rate_sot_pct
    )
    select player_id, team_id, matches_played, avg_shots_on_target, avg_fouls, hit_rate_sot_pct
    from computed
    on conflict (player_id, team_id) do update
    set matches_played = excluded.matches_played,
        avg_shots_on_target = excluded.avg_shots_on_target,
        avg_fouls = excluded.avg_fouls,
        hit_rate_sot_pct = excluded.hit_rate_sot_pct,
        updated_at = now()
    returning 1
  )
  select count(*) into stored from upserted;

  delete from public.player_prop_stats as saved
  where saved.updated_at < now() - interval '1 minute';

  return stored;
end;
$$;

revoke all on function public.refresh_player_prop_stats() from public, anon, authenticated;
grant execute on function public.refresh_player_prop_stats() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prop-summaries-nightly') then
    perform cron.unschedule('prop-summaries-nightly');
  end if;
  perform cron.schedule(
    'prop-summaries-nightly',
    '0 3 * * *',
    'select public.refresh_prop_summaries(), public.refresh_player_prop_stats();'
  );
end;
$$;
