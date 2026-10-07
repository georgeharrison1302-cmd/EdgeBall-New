-- AI Ladder Challenge (£10 → £1k): run state + daily steps.

create table if not exists public.ladder_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active'
    check (status in ('active', 'completed', 'busted')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  current_step integer not null default 1,
  starting_bankroll numeric(10, 2) not null default 10.00,
  current_pot numeric(10, 2) not null default 10.00,
  target_pot numeric(10, 2) not null default 1000.00
);

comment on table public.ladder_runs is
  'Ladder Challenge bankroll runs — AI rolls £10 toward £1,000 via daily 1.35–1.55 doubles/singles.';

comment on column public.ladder_runs.current_pot is
  'Live bankroll after settled steps; stake for the next pending step.';

create table if not exists public.ladder_steps (
  id uuid primary key default gen_random_uuid(),
  ladder_run_id uuid not null references public.ladder_runs (id) on delete cascade,
  step_number integer not null,
  date date not null,
  legs jsonb not null,
  combined_odds numeric(5, 2) not null,
  stake numeric(10, 2) not null,
  potential_return numeric(10, 2) not null,
  result text not null default 'pending'
    check (result in ('pending', 'won', 'lost', 'void')),
  created_at timestamptz not null default now(),
  unique (ladder_run_id, step_number),
  unique (ladder_run_id, date)
);

comment on table public.ladder_steps is
  'One Ladder Challenge pick per calendar day: legs JSONB (player, market, odds, hit_rate) plus settlement.';

comment on column public.ladder_steps.legs is
  'Array of candidate leg objects: player, market, odds, hit_rate (and optional fixture/book links).';

create index if not exists ladder_runs_status_started_idx
  on public.ladder_runs (status, started_at desc);

create index if not exists ladder_steps_run_step_idx
  on public.ladder_steps (ladder_run_id, step_number);

create index if not exists ladder_steps_date_idx
  on public.ladder_steps (date desc);

create index if not exists ladder_steps_result_idx
  on public.ladder_steps (result);

alter table public.ladder_runs enable row level security;
alter table public.ladder_steps enable row level security;

drop policy if exists ladder_runs_select_public on public.ladder_runs;
create policy ladder_runs_select_public
  on public.ladder_runs for select
  to anon, authenticated
  using (true);

drop policy if exists ladder_steps_select_public on public.ladder_steps;
create policy ladder_steps_select_public
  on public.ladder_steps for select
  to anon, authenticated
  using (true);

grant select on public.ladder_runs to anon, authenticated;
grant select on public.ladder_steps to anon, authenticated;
grant select, insert, update, delete on public.ladder_runs to service_role;
grant select, insert, update, delete on public.ladder_steps to service_role;
