alter table public.team_statistics drop constraint team_statistics_pkey;

alter table public.team_statistics
  add column id bigint generated always as identity;

alter table public.team_statistics
  add primary key (id);

create unique index team_statistics_snapshot_key
  on public.team_statistics (team_id, league_id, season, as_of_date)
  nulls not distinct;

grant usage, select on sequence public.team_statistics_id_seq to service_role;
