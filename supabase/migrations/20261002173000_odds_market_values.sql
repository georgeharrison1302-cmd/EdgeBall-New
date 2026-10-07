-- One odds row per fixture, bookmaker, and market.
-- The prices for that market live together in values, for example
-- [{"value":"Home","odd":1.30},{"value":"Draw","odd":5.00},{"value":"Away","odd":9.00}].

create table if not exists public.odds_markets (
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  bookmaker_id bigint not null references public.bookmakers (id) on delete cascade,
  market_id bigint not null references public.bets (id) on delete cascade,
  values jsonb not null,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, bookmaker_id, market_id)
);

insert into public.odds_markets (fixture_id, bookmaker_id, market_id, values, captured_at)
select fixture_id,
       bookmaker_id,
       bet_id,
       jsonb_agg(jsonb_build_object('value', value, 'odd', odd) order by value),
       max(captured_at)
from public.odds
group by fixture_id, bookmaker_id, bet_id
on conflict (fixture_id, bookmaker_id, market_id) do update
set values = excluded.values,
    captured_at = excluded.captured_at;

drop table public.odds;

alter table public.odds_markets rename to odds;
alter table public.odds rename constraint odds_markets_pkey to odds_pkey;
alter table public.odds rename constraint odds_markets_fixture_id_fkey to odds_fixture_id_fkey;
alter table public.odds rename constraint odds_markets_bookmaker_id_fkey to odds_bookmaker_id_fkey;
alter table public.odds rename constraint odds_markets_market_id_fkey to odds_market_id_fkey;

drop trigger if exists set_updated_at on public.odds;
create trigger set_updated_at
before update on public.odds
for each row execute procedure public.set_updated_at();

alter table public.odds enable row level security;

drop policy if exists odds_select_public on public.odds;
create policy odds_select_public
on public.odds
for select
to anon, authenticated
using (true);

grant select on public.odds to anon, authenticated;
grant select, insert, update, delete on public.odds to service_role;
