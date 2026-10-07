-- Venues and teams already exist. These statements keep that data and add the
-- league membership junction from the relational integrity rule.

create table if not exists public.venues (
  id bigint primary key,
  name text,
  address text,
  city text,
  country_name text,
  capacity integer,
  surface text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id bigint primary key,
  name text not null,
  code text,
  country_name text,
  founded smallint,
  national boolean,
  logo_url text,
  venue_id bigint references public.venues (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_teams (
  league_id bigint not null references public.leagues (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (league_id, team_id)
);

create index if not exists league_teams_team_id_idx on public.league_teams (team_id);
create index if not exists teams_venue_id_idx on public.teams (venue_id);

drop trigger if exists set_updated_at on public.league_teams;
create trigger set_updated_at
before update on public.league_teams
for each row execute procedure public.set_updated_at();

alter table public.league_teams enable row level security;

drop policy if exists league_teams_select_public on public.league_teams;
create policy league_teams_select_public
on public.league_teams
for select
to anon, authenticated
using (true);

grant select on public.league_teams to anon, authenticated;
grant select, insert, update, delete on public.league_teams to service_role;
