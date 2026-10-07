create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.app_config;
create trigger set_updated_at
before update on public.app_config
for each row execute procedure public.set_updated_at();

alter table public.app_config enable row level security;

drop policy if exists app_config_select_public on public.app_config;
create policy app_config_select_public
on public.app_config
for select
to anon, authenticated
using (true);

grant select on public.app_config to anon, authenticated;
grant select, insert, update, delete on public.app_config to service_role;
