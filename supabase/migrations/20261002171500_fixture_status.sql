-- Fixtures already exist. This keeps that data and adds the short status code
-- (NS, 1H, FT, and the other API-Football codes) beside status_short.
-- kickoff_at is timestamptz and stores fixture.date in UTC.

create table if not exists public.fixtures (
  id bigint primary key,
  referee text,
  timezone text,
  kickoff_at timestamptz,
  timestamp bigint,
  periods_first integer,
  periods_second integer,
  venue_id bigint references public.venues (id) on delete set null,
  status text,
  status_long text,
  status_short text,
  status_elapsed integer,
  status_extra integer,
  league_id bigint not null references public.leagues (id),
  season smallint not null,
  round text,
  covers_standings boolean,
  home_team_id bigint references public.teams (id),
  away_team_id bigint references public.teams (id),
  home_winner boolean,
  away_winner boolean,
  goals_home integer,
  goals_away integer,
  score jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fixtures add column if not exists status text;

update public.fixtures
set status = status_short
where status is null
  and status_short is not null;

create index if not exists fixtures_status_idx on public.fixtures (status);
