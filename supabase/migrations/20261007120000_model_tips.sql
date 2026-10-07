create table if not exists public.model_tips (
  id bigint generated always as identity primary key,
  tip_key text not null unique,
  fixture_id bigint not null,
  market text not null,
  selection text not null,
  player_id bigint,
  outcome text,
  odds numeric not null,
  model_prob numeric not null,
  edge_pct numeric not null,
  source text not null,
  kickoff timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'won', 'lost', 'void')),
  profit numeric,
  generated_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.model_tips enable row level security;

drop policy if exists model_tips_select_public on public.model_tips;
create policy model_tips_select_public
  on public.model_tips
  for select
  to anon, authenticated
  using (true);

grant select on public.model_tips to anon, authenticated;
grant select, insert, update on public.model_tips to service_role;

create index if not exists model_tips_fixture_idx on public.model_tips (fixture_id);
create index if not exists model_tips_status_idx on public.model_tips (status);
create index if not exists model_tips_source_idx on public.model_tips (source);
