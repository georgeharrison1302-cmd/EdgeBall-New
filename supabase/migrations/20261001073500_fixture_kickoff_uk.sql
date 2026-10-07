alter table public.fixtures
  add column if not exists kickoff_uk timestamp without time zone
  generated always as (kickoff_at at time zone 'Europe/London') stored;
