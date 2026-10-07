alter table public.odds add column if not exists market_name text;
alter table public.odds add column if not exists update_at timestamptz;

update public.odds as price
set market_name = bet.name
from public.bets as bet
where bet.id = price.market_id
  and price.market_name is null;

update public.odds
set update_at = captured_at
where update_at is null
  and captured_at is not null;
