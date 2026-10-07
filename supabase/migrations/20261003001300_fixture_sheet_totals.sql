alter table public.fixture_statistics
  add column expected_goals numeric,
  add column corners integer;

comment on column public.fixture_statistics.expected_goals is
  'Expected goals for this team in this match, from API-Football fixtures/statistics.';

comment on column public.fixture_statistics.corners is
  'Corner kicks for this team in this match, from API-Football fixtures/statistics. Actual corners, not expected corners.';

update public.fixture_statistics
set
  expected_goals = case
    when jsonb_typeof(stats->'expected_goals') = 'number' then (stats->>'expected_goals')::numeric
    when jsonb_typeof(stats->'expected_goals') = 'string'
      and (stats->>'expected_goals') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (stats->>'expected_goals')::numeric
    else null
  end,
  corners = case
    when jsonb_typeof(stats->'Corner Kicks') in ('number', 'string')
      and (stats->>'Corner Kicks') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then round((stats->>'Corner Kicks')::numeric)::integer
    else null
  end;

create view public.team_match_sheet_totals
with (security_invoker = true) as
select
  f.league_id,
  f.season,
  fs.team_id,
  sum(fs.expected_goals) as expected_goals,
  sum(fs.corners)::integer as corners
from public.fixture_statistics fs
join public.fixtures f on f.id = fs.fixture_id
where fs.period = 'FT'
  and f.status_short in ('FT', 'AET', 'PEN')
group by f.league_id, f.season, fs.team_id;

comment on view public.team_match_sheet_totals is
  'Season sums of stored match-sheet expected goals and corner kicks. Expected corners are not provided by API-Football.';

grant select on public.team_match_sheet_totals to anon, authenticated, service_role;
