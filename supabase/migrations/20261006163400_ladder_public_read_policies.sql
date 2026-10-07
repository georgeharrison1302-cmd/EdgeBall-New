-- Explicit public SELECT policies for Ladder UI (anon + authenticated).
-- Without a policy, RLS-enabled tables return empty sets with no error.

alter table public.ladder_runs enable row level security;
alter table public.ladder_steps enable row level security;

drop policy if exists "Enable read access for all users" on public.ladder_runs;
create policy "Enable read access for all users"
  on public.ladder_runs
  for select
  using (true);

drop policy if exists "Enable read access for all users" on public.ladder_steps;
create policy "Enable read access for all users"
  on public.ladder_steps
  for select
  using (true);

-- Keep legacy named policies in sync if they still exist from the create migration.
drop policy if exists ladder_runs_select_public on public.ladder_runs;
drop policy if exists ladder_steps_select_public on public.ladder_steps;

grant select on public.ladder_runs to anon, authenticated;
grant select on public.ladder_steps to anon, authenticated;
grant select, insert, update, delete on public.ladder_runs to service_role;
grant select, insert, update, delete on public.ladder_steps to service_role;
