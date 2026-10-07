alter table public.player_seasons
  add column if not exists yellow_rank integer,
  add column if not exists red_rank integer;
