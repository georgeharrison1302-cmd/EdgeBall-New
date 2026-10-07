alter table public.live_odds
  add column if not exists handicap text not null default '',
  add column if not exists suspended boolean;

alter table public.live_odds drop constraint if exists live_odds_pkey;
alter table public.live_odds
  add primary key (fixture_id, bet_id, value, handicap, captured_at);
