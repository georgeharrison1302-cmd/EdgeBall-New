alter table public.fixture_rounds
  add column if not exists is_current boolean not null default false;

create index if not exists fixture_rounds_current_idx
  on public.fixture_rounds (league_id, season)
  where is_current;
