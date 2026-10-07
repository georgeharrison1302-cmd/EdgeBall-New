-- EdgeBall Pro subscriptions (Stripe ↔ Auth)
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive'
    check (subscription_status in ('active', 'inactive', 'past_due')),
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_subscriptions_customer_idx
  on public.user_subscriptions (stripe_customer_id);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (subscription_status);

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own
  on public.user_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes come from service_role (webhooks / checkout); users cannot self-activate.
grant select on public.user_subscriptions to authenticated;
grant select, insert, update, delete on public.user_subscriptions to service_role;
