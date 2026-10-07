alter table public.fixtures
  add column if not exists kickoff_unix_at timestamptz
  generated always as (to_timestamp("timestamp")) stored;
