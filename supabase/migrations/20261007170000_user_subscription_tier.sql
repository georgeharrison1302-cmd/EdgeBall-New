-- Store the recurring Stripe catalog tier resolved from the subscription price ID.
alter table public.user_subscriptions
  add column if not exists subscription_tier text
  check (subscription_tier in ('pro', 'premium'));

create index if not exists user_subscriptions_tier_idx
  on public.user_subscriptions (subscription_tier);
