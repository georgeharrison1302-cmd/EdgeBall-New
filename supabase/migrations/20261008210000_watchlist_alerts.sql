create table if not exists public.user_watchlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('team', 'fixture')),
  entity_id bigint not null,
  label text not null,
  href text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, entity_id)
);

create table if not exists public.user_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  kind text not null check (kind in ('lineup', 'kickoff', 'tip')),
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists user_watchlist_user_idx on public.user_watchlist (user_id, created_at desc);
create index if not exists user_alerts_user_idx on public.user_alerts (user_id, created_at desc);

alter table public.user_watchlist enable row level security;
alter table public.user_alerts enable row level security;

drop policy if exists user_watchlist_own on public.user_watchlist;
create policy user_watchlist_own on public.user_watchlist
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_alerts_select_own on public.user_alerts;
create policy user_alerts_select_own on public.user_alerts
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_alerts_update_own on public.user_alerts;
create policy user_alerts_update_own on public.user_alerts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_watchlist to authenticated;
grant select, update on public.user_alerts to authenticated;
grant select, insert, update, delete on public.user_watchlist to service_role;
grant select, insert, update, delete on public.user_alerts to service_role;
