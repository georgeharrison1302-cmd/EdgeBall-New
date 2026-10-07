create table if not exists public.league_table_advanced (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  team_id bigint not null references public.teams (id) on delete cascade,
  team_name text not null,
  logo_url text,
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points integer,
  avg_xg_for numeric(4,2),
  avg_xg_against numeric(4,2),
  avg_corners_home numeric(4,2),
  avg_corners_away numeric(4,2),
  total_corners_avg numeric(4,2),
  btts_hit_rate_pct numeric(5,1),
  over_2_half_hit_rate_pct numeric(5,1),
  updated_at timestamptz not null default now(),
  primary key (league_id, season, team_id)
);

comment on table public.league_table_advanced is
  'Nightly standings plus per-game expected goals, expected goals conceded, corner averages, and both-teams-to-score and over 2.5 hit rates.';

comment on column public.league_table_advanced.avg_xg_against is
  'Expected goals conceded per game, from the opponent expected goals on stored match sheets.';

comment on column public.league_table_advanced.btts_hit_rate_pct is
  'Percentage of this team''s finished matches in the competition where both teams scored.';

comment on column public.league_table_advanced.over_2_half_hit_rate_pct is
  'Percentage of this team''s finished matches in the competition with 3 or more total goals.';

alter table public.league_table_advanced enable row level security;

drop policy if exists league_table_advanced_select_public on public.league_table_advanced;
create policy league_table_advanced_select_public
on public.league_table_advanced
for select
to anon, authenticated
using (true);

grant select on public.league_table_advanced to anon, authenticated;
grant select, insert, update, delete on public.league_table_advanced to service_role;

create or replace function public.refresh_league_table_advanced()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored integer;
begin
  with grouped as (
    select league_id, season, coalesce(group_name, '') as group_name, count(*) as teams
    from public.standings
    group by league_id, season, coalesce(group_name, '')
  ),
  main_group as (
    select distinct on (league_id, season) league_id, season, group_name
    from grouped
    order by league_id, season, teams desc, group_name
  ),
  base as (
    select distinct on (standing.league_id, standing.season, standing.team_id)
      standing.league_id,
      standing.season,
      standing.team_id,
      coalesce(club.name, 'Club') as team_name,
      club.logo_url,
      standing.rank,
      standing.played,
      standing.win as wins,
      standing.draw as draws,
      standing.lose as losses,
      standing.points
    from public.standings as standing
    join main_group
      on main_group.league_id = standing.league_id
     and main_group.season = standing.season
     and coalesce(standing.group_name, '') = main_group.group_name
    join public.teams as club on club.id = standing.team_id
    order by standing.league_id, standing.season, standing.team_id, standing.rank nulls last
  ),
  rates as (
    select
      fixture.league_id,
      fixture.season,
      side.team_id,
      count(*) filter (where fixture.goals_home is not null and fixture.goals_away is not null)::integer as scored,
      count(*) filter (where fixture.goals_home > 0 and fixture.goals_away > 0)::integer as btts,
      count(*) filter (where fixture.goals_home + fixture.goals_away >= 3)::integer as over_2_half
    from public.fixtures as fixture
    join lateral (
      select fixture.home_team_id as team_id
      union all
      select fixture.away_team_id
    ) as side on side.team_id is not null
    where fixture.status_short in ('FT', 'AET', 'PEN')
    group by fixture.league_id, fixture.season, side.team_id
  ),
  computed as (
    select
      base.league_id,
      base.season,
      base.team_id,
      base.team_name,
      base.logo_url,
      base.rank,
      base.played,
      base.wins,
      base.draws,
      base.losses,
      base.points,
      sheets.xg_per_game::numeric(4,2) as avg_xg_for,
      sheets.xc_per_game::numeric(4,2) as avg_xg_against,
      sheets.home_corners_per_game::numeric(4,2) as avg_corners_home,
      sheets.away_corners_per_game::numeric(4,2) as avg_corners_away,
      sheets.corners_per_game::numeric(4,2) as total_corners_avg,
      case
        when rates.scored > 0 then round(100.0 * rates.btts / rates.scored, 1)
        else null
      end as btts_hit_rate_pct,
      case
        when rates.scored > 0 then round(100.0 * rates.over_2_half / rates.scored, 1)
        else null
      end as over_2_half_hit_rate_pct
    from base
    left join public.team_match_sheet_totals as sheets
      on sheets.league_id = base.league_id
     and sheets.season = base.season
     and sheets.team_id = base.team_id
    left join rates
      on rates.league_id = base.league_id
     and rates.season = base.season
     and rates.team_id = base.team_id
  ),
  upserted as (
    insert into public.league_table_advanced (
      league_id,
      season,
      team_id,
      team_name,
      logo_url,
      rank,
      played,
      wins,
      draws,
      losses,
      points,
      avg_xg_for,
      avg_xg_against,
      avg_corners_home,
      avg_corners_away,
      total_corners_avg,
      btts_hit_rate_pct,
      over_2_half_hit_rate_pct
    )
    select
      league_id,
      season,
      team_id,
      team_name,
      logo_url,
      rank,
      played,
      wins,
      draws,
      losses,
      points,
      avg_xg_for,
      avg_xg_against,
      avg_corners_home,
      avg_corners_away,
      total_corners_avg,
      btts_hit_rate_pct,
      over_2_half_hit_rate_pct
    from computed
    on conflict (league_id, season, team_id) do update
    set team_name = excluded.team_name,
        logo_url = excluded.logo_url,
        rank = excluded.rank,
        played = excluded.played,
        wins = excluded.wins,
        draws = excluded.draws,
        losses = excluded.losses,
        points = excluded.points,
        avg_xg_for = excluded.avg_xg_for,
        avg_xg_against = excluded.avg_xg_against,
        avg_corners_home = excluded.avg_corners_home,
        avg_corners_away = excluded.avg_corners_away,
        total_corners_avg = excluded.total_corners_avg,
        btts_hit_rate_pct = excluded.btts_hit_rate_pct,
        over_2_half_hit_rate_pct = excluded.over_2_half_hit_rate_pct,
        updated_at = now()
    returning 1
  )
  select count(*) into stored from upserted;

  if stored > 0 then
    delete from public.league_table_advanced as saved
    where not exists (
      select 1
      from public.standings as standing
      where standing.league_id = saved.league_id
        and standing.season = saved.season
        and standing.team_id = saved.team_id
    );
  end if;

  return stored;
end;
$$;

revoke all on function public.refresh_league_table_advanced() from public, anon, authenticated;
grant execute on function public.refresh_league_table_advanced() to service_role;

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

  perform public.refresh_league_table_advanced();

  return stored;
end;
$$;

revoke all on function public.refresh_betting_summaries() from public, anon, authenticated;
grant execute on function public.refresh_betting_summaries() to service_role;
