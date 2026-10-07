create table public.api_quota_log (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default now(),
  requests_remaining integer,
  minute_remaining integer,
  path text not null,
  status integer not null
);

comment on table public.api_quota_log is
  'One row per API-Football response. requests_remaining is x-ratelimit-requests-remaining.';

create index api_quota_log_recorded_at_idx
  on public.api_quota_log (recorded_at desc);

alter table public.api_quota_log enable row level security;

revoke all on table public.api_quota_log from public, anon, authenticated;
grant select, insert on table public.api_quota_log to service_role;
