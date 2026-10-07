create table if not exists public.timezones (
  name text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.timezones;
create trigger set_updated_at
before update on public.timezones
for each row execute procedure public.set_updated_at();

alter table public.timezones enable row level security;

drop policy if exists timezones_select_public on public.timezones;
create policy timezones_select_public
on public.timezones
for select
to anon, authenticated
using (true);
