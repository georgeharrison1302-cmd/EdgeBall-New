-- EdgeBall football schema.
-- These tables are the database model, not a 1:1 copy of API-Football endpoints.
-- Season is a year column. Live, H2H, and top scorers are queries, not tables.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core entities
-- ---------------------------------------------------------------------------

create table if not exists public.countries (
  name text primary key,
  code text,
  flag_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id bigint primary key,
  name text not null,
  type text,
  logo_url text,
  country_name text references public.countries (name) on update cascade,
  country_code text,
  country_flag_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_seasons (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  coverage_events boolean,
  coverage_lineups boolean,
  coverage_fixture_statistics boolean,
  coverage_player_statistics boolean,
  coverage_standings boolean,
  coverage_players boolean,
  coverage_top_scorers boolean,
  coverage_top_assists boolean,
  coverage_top_cards boolean,
  coverage_injuries boolean,
  coverage_predictions boolean,
  coverage_odds boolean,
  coverage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (league_id, season)
);

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

create table if not exists public.players (
  id bigint primary key,
  name text,
  firstname text,
  lastname text,
  age smallint,
  birth_date date,
  birth_place text,
  birth_country text,
  nationality text,
  height text,
  weight text,
  number smallint,
  position text,
  photo_url text,
  injured boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coaches (
  id bigint primary key,
  name text,
  firstname text,
  lastname text,
  age smallint,
  nationality text,
  photo_url text,
  birth_date date,
  birth_place text,
  birth_country text,
  team_id bigint references public.teams (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixtures (
  id bigint primary key,
  referee text,
  timezone text,
  kickoff_at timestamptz,
  timestamp bigint,
  periods_first integer,
  periods_second integer,
  venue_id bigint references public.venues (id) on delete set null,
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

-- ---------------------------------------------------------------------------
-- Membership and season stats
-- ---------------------------------------------------------------------------

create table if not exists public.team_seasons (
  team_id bigint not null references public.teams (id) on delete cascade,
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, league_id, season)
);

create table if not exists public.team_statistics (
  team_id bigint not null references public.teams (id) on delete cascade,
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  as_of_date date,
  form text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, league_id, season)
);

create table if not exists public.player_teams (
  player_id bigint not null references public.players (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  season smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, team_id, season)
);

create table if not exists public.player_seasons (
  player_id bigint not null references public.players (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  scorer_rank integer,
  yellow_rank integer,
  red_rank integer,
  position text,
  rating text,
  appearances integer,
  lineups integer,
  minutes integer,
  number smallint,
  captain boolean,
  goals integer,
  assists integer,
  shots_total integer,
  shots_on integer,
  goals_conceded integer,
  saves integer,
  passes_total integer,
  passes_key integer,
  passes_accuracy integer,
  tackles integer,
  blocks integer,
  interceptions integer,
  duels_total integer,
  duels_won integer,
  dribbles_attempts integer,
  dribbles_success integer,
  fouls_drawn integer,
  fouls_committed integer,
  yellow_cards integer,
  yellowred_cards integer,
  red_cards integer,
  penalty_scored integer,
  penalty_missed integer,
  substitutes_in integer,
  substitutes_out integer,
  bench integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, team_id, league_id, season)
);

create table if not exists public.squads (
  team_id bigint not null references public.teams (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete cascade,
  number smallint,
  position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists public.coach_career (
  id bigint generated always as identity primary key,
  coach_id bigint not null references public.coaches (id) on delete cascade,
  team_id bigint references public.teams (id) on delete set null,
  team_name text,
  start_date date,
  end_date date
);

create table if not exists public.standings (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  group_name text not null default '',
  team_id bigint not null references public.teams (id) on delete cascade,
  rank integer,
  points integer,
  goals_diff integer,
  form text,
  status text,
  description text,
  played integer,
  win integer,
  draw integer,
  lose integer,
  goals_for integer,
  goals_against integer,
  home_played integer,
  home_win integer,
  home_draw integer,
  home_lose integer,
  home_goals_for integer,
  home_goals_against integer,
  away_played integer,
  away_win integer,
  away_draw integer,
  away_lose integer,
  away_goals_for integer,
  away_goals_against integer,
  api_updated_at timestamptz,
  home jsonb not null default '{}'::jsonb,
  away jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (league_id, season, group_name, team_id)
);

-- ---------------------------------------------------------------------------
-- Fixture children
-- ---------------------------------------------------------------------------

create table if not exists public.fixture_rounds (
  league_id bigint not null references public.leagues (id) on delete cascade,
  season smallint not null,
  round text not null,
  dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (league_id, season, round)
);

create table if not exists public.fixture_events (
  id bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  time_elapsed integer,
  time_extra integer,
  team_id bigint references public.teams (id) on delete set null,
  player_id bigint references public.players (id) on delete set null,
  assist_id bigint references public.players (id) on delete set null,
  type text,
  detail text,
  comments text
);

create table if not exists public.fixture_lineups (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  formation text,
  coach_id bigint references public.coaches (id) on delete set null,
  colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id)
);

create table if not exists public.fixture_lineup_players (
  fixture_id bigint not null,
  team_id bigint not null,
  player_id bigint not null references public.players (id) on delete cascade,
  player_name text,
  number smallint,
  position text,
  grid text,
  is_starter boolean not null default false,
  primary key (fixture_id, team_id, player_id),
  foreign key (fixture_id, team_id)
    references public.fixture_lineups (fixture_id, team_id) on delete cascade
);

create table if not exists public.fixture_statistics (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  team_id bigint not null references public.teams (id) on delete cascade,
  period text not null default 'FT',
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id, period)
);

create table if not exists public.fixture_player_statistics (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  team_id bigint references public.teams (id) on delete set null,
  player_id bigint not null references public.players (id) on delete cascade,
  minutes integer,
  rating text,
  captain boolean,
  substitute boolean,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, player_id)
);

create table if not exists public.predictions (
  fixture_id bigint primary key references public.fixtures (id) on delete cascade,
  winner_id bigint references public.teams (id) on delete set null,
  winner_comment text,
  win_or_draw boolean,
  under_over text,
  advice text,
  percent_home text,
  percent_draw text,
  percent_away text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.injuries (
  id bigint generated always as identity primary key,
  fixture_id bigint references public.fixtures (id) on delete cascade,
  league_id bigint references public.leagues (id) on delete cascade,
  season smallint,
  team_id bigint references public.teams (id) on delete set null,
  player_id bigint references public.players (id) on delete set null,
  type text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Odds. Pre-match bet IDs and live bet IDs are different namespaces.
-- ---------------------------------------------------------------------------

create table if not exists public.bookmakers (
  id bigint primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bets (
  id bigint primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_bets (
  id bigint primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.odds (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  bookmaker_id bigint not null references public.bookmakers (id) on delete cascade,
  bet_id bigint not null references public.bets (id) on delete cascade,
  value text not null,
  odd numeric,
  captured_at timestamptz not null default now(),
  primary key (fixture_id, bookmaker_id, bet_id, value)
);

create table if not exists public.live_odds (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  bookmaker_id bigint,
  bet_id bigint not null,
  value text not null,
  odd numeric,
  main boolean,
  stopped boolean,
  blocked boolean,
  finished boolean,
  captured_at timestamptz not null default now(),
  primary key (fixture_id, bet_id, value, captured_at)
);

-- ---------------------------------------------------------------------------
-- Career extras
-- ---------------------------------------------------------------------------

create table if not exists public.transfers (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players (id) on delete cascade,
  date date,
  type text,
  team_in_id bigint references public.teams (id) on delete set null,
  team_out_id bigint references public.teams (id) on delete set null
);

create table if not exists public.trophies (
  id bigint generated always as identity primary key,
  player_id bigint references public.players (id) on delete cascade,
  coach_id bigint references public.coaches (id) on delete cascade,
  league_name text,
  country text,
  season text,
  place text,
  check (player_id is not null or coach_id is not null)
);

create table if not exists public.sidelined (
  id bigint generated always as identity primary key,
  player_id bigint references public.players (id) on delete cascade,
  coach_id bigint references public.coaches (id) on delete cascade,
  type text,
  start_date date,
  end_date text,
  check (player_id is not null or coach_id is not null)
);

create table if not exists public.ingest_checkpoints (
  id text primary key,
  resource text not null,
  params jsonb not null default '{}'::jsonb,
  last_status text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists teams_country_name_idx on public.teams (country_name);
create index if not exists teams_code_idx on public.teams (code);
create index if not exists teams_venue_id_idx on public.teams (venue_id);
create index if not exists players_name_trgm_idx on public.players using gin (name gin_trgm_ops);
create index if not exists coaches_team_id_idx on public.coaches (team_id);
create index if not exists fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index if not exists fixtures_league_season_idx on public.fixtures (league_id, season);
create index if not exists fixtures_status_short_idx on public.fixtures (status_short);
create index if not exists fixtures_home_team_id_idx on public.fixtures (home_team_id);
create index if not exists fixtures_away_team_id_idx on public.fixtures (away_team_id);
create index if not exists fixtures_venue_id_idx on public.fixtures (venue_id);
create index if not exists fixture_events_fixture_id_idx on public.fixture_events (fixture_id);
create index if not exists fixture_events_type_idx on public.fixture_events (type);
create index if not exists injuries_fixture_id_idx on public.injuries (fixture_id);
create index if not exists injuries_player_id_idx on public.injuries (player_id);
create index if not exists player_seasons_league_season_goals_idx
  on public.player_seasons (league_id, season, goals desc);
create index if not exists player_seasons_league_season_assists_idx
  on public.player_seasons (league_id, season, assists desc);
create index if not exists live_odds_fixture_id_idx on public.live_odds (fixture_id);
create index if not exists transfers_player_id_idx on public.transfers (player_id);
create index if not exists trophies_player_id_idx on public.trophies (player_id);
create index if not exists trophies_coach_id_idx on public.trophies (coach_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'countries',
    'leagues',
    'league_seasons',
    'venues',
    'teams',
    'players',
    'coaches',
    'fixtures',
    'team_seasons',
    'team_statistics',
    'player_teams',
    'player_seasons',
    'squads',
    'standings',
    'fixture_rounds',
    'fixture_lineups',
    'fixture_statistics',
    'fixture_player_statistics',
    'predictions',
    'injuries',
    'bookmakers',
    'bets',
    'live_bets',
    'ingest_checkpoints'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at
       before update on public.%I
       for each row execute procedure public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: public read, writes only via service role (bypasses RLS)
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'countries',
    'leagues',
    'league_seasons',
    'venues',
    'teams',
    'players',
    'coaches',
    'fixtures',
    'team_seasons',
    'team_statistics',
    'player_teams',
    'player_seasons',
    'squads',
    'coach_career',
    'standings',
    'fixture_rounds',
    'fixture_events',
    'fixture_lineups',
    'fixture_lineup_players',
    'fixture_statistics',
    'fixture_player_statistics',
    'predictions',
    'injuries',
    'bookmakers',
    'bets',
    'live_bets',
    'odds',
    'live_odds',
    'transfers',
    'trophies',
    'sidelined'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_public', table_name);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      table_name || '_select_public',
      table_name
    );
  end loop;

  alter table public.ingest_checkpoints enable row level security;
end;
$$;
