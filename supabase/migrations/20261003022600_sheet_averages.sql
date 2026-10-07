drop view if exists public.team_match_sheet_totals;

create view public.team_match_sheet_totals
with (security_invoker = true) as
with sheets as (
  select
    f.league_id,
    f.season,
    f.id as fixture_id,
    fs.team_id,
    fs.expected_goals,
    fs.corners,
    case
      when fs.team_id = f.home_team_id then 'home'
      when fs.team_id = f.away_team_id then 'away'
      else null
    end as side
  from public.fixture_statistics fs
  join public.fixtures f on f.id = fs.fixture_id
  where fs.period = 'FT'
    and f.status_short in ('FT', 'AET', 'PEN')
),
paired as (
  select
    s.league_id,
    s.season,
    s.team_id,
    s.side,
    s.expected_goals as xg,
    opp.expected_goals as xc,
    s.corners
  from sheets s
  left join sheets opp
    on opp.fixture_id = s.fixture_id
   and opp.team_id <> s.team_id
)
select
  league_id,
  season,
  team_id,
  round(avg(xg), 2) as xg_per_game,
  round(avg(xg) filter (where side = 'home'), 2) as home_xg_per_game,
  round(avg(xg) filter (where side = 'away'), 2) as away_xg_per_game,
  round(avg(xc), 2) as xc_per_game,
  round(avg(xc) filter (where side = 'home'), 2) as home_xc_per_game,
  round(avg(xc) filter (where side = 'away'), 2) as away_xc_per_game,
  round(avg(corners), 2) as corners_per_game,
  round(avg(corners) filter (where side = 'home'), 2) as home_corners_per_game,
  round(avg(corners) filter (where side = 'away'), 2) as away_corners_per_game
from paired
group by league_id, season, team_id;

comment on view public.team_match_sheet_totals is
  'Per-game averages from stored match sheets. xC is the opponent expected goals. Corner averages are actual corner kicks, split home, away, and overall.';

grant select on public.team_match_sheet_totals to anon, authenticated, service_role;
