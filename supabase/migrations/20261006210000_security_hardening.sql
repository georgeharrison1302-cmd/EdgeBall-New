-- Security hardening: settlement integrity, config lockdown, odds RLS, least-privilege defaults.

-- ---------------------------------------------------------------------------
-- 1) user_bets: clients must not update settlement (or any) fields.
--    Grading / settlement runs as service_role only.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_bets') is not null then
    execute 'drop policy if exists user_bets_update_own on public.user_bets';
    revoke all on table public.user_bets from anon;
    revoke all on table public.user_bets from authenticated;
    grant select, insert, delete on table public.user_bets to authenticated;
    grant select, insert, update, delete on table public.user_bets to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) app_config: revoke public read when the table exists (service_role only).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.app_config') is not null then
    execute 'drop policy if exists app_config_select_public on public.app_config';
    revoke all on table public.app_config from anon, authenticated;
    grant select, insert, update, delete on table public.app_config to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) odds: ensure RLS + public SELECT only (writes via service_role / no client policies).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.odds') is not null then
    alter table public.odds enable row level security;
    execute 'drop policy if exists odds_select_public on public.odds';
    execute $policy$
      create policy odds_select_public
        on public.odds
        for select
        to anon, authenticated
        using (true)
    $policy$;
    revoke all on table public.odds from anon, authenticated;
    grant select on table public.odds to anon, authenticated;
    grant select, insert, update, delete on table public.odds to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) ingest_checkpoints: ensure no anon/authenticated access.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ingest_checkpoints') is not null then
    alter table public.ingest_checkpoints enable row level security;
    revoke all on table public.ingest_checkpoints from anon, authenticated;
    grant select, insert, update on table public.ingest_checkpoints to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Stop blanket default SELECT on future tables for anon/authenticated.
--    Existing product tables keep their explicit grants + RLS policies.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  revoke select on tables from anon, authenticated;
