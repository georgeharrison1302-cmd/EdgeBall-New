create table if not exists public.user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  settled_at timestamptz null,
  status text not null default 'active'
    check (status in ('active', 'won', 'lost', 'void', 'partial')),
  stake numeric not null check (stake > 0),
  combined_odds numeric not null check (combined_odds > 1),
  potential_return numeric not null,
  profit numeric null,
  currency text not null default 'GBP',
  legs jsonb not null default '[]'::jsonb,
  notes text null
);

create index if not exists user_bets_user_created_idx
  on public.user_bets (user_id, created_at desc);
create index if not exists user_bets_status_idx
  on public.user_bets (status);

alter table public.user_bets enable row level security;

drop policy if exists user_bets_select_own on public.user_bets;
create policy user_bets_select_own
  on public.user_bets for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_bets_insert_own on public.user_bets;
create policy user_bets_insert_own
  on public.user_bets for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_bets_update_own on public.user_bets;
create policy user_bets_update_own
  on public.user_bets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_bets_delete_own on public.user_bets;
create policy user_bets_delete_own
  on public.user_bets for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_bets to authenticated;
grant select, insert, update, delete on public.user_bets to service_role;
