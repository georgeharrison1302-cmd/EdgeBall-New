alter table public.player_seasons
  add column if not exists assist_rank integer,
  add column if not exists dribbles_past integer,
  add column if not exists penalty_won integer,
  add column if not exists penalty_committed integer,
  add column if not exists penalty_saved integer;
