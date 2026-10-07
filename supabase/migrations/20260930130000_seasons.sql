create table if not exists public.seasons (
  year smallint primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.seasons;
create trigger set_updated_at
before update on public.seasons
for each row execute procedure public.set_updated_at();

alter table public.seasons enable row level security;

drop policy if exists seasons_select_public on public.seasons;
create policy seasons_select_public
on public.seasons
for select
to anon, authenticated
using (true);

grant select on public.seasons to anon, authenticated;
grant select, insert, update, delete on public.seasons to service_role;
