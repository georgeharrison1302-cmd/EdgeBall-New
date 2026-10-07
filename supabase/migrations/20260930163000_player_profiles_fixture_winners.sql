alter table public.players
  add column if not exists number smallint,
  add column if not exists position text;

alter table public.fixtures
  add column if not exists home_winner boolean,
  add column if not exists away_winner boolean;
