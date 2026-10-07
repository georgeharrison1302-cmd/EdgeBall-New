-- API-Football /countries has no numeric id. name is the key other tables use.
-- id is a local surrogate so each country row still has an id.

create table if not exists public.countries (
  id bigint generated always as identity unique,
  name text primary key,
  code text,
  flag_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.countries
  add column if not exists id bigint generated always as identity;

create unique index if not exists countries_id_key on public.countries (id);

-- API field league.logo is stored as logo_url.
create table if not exists public.leagues (
  id bigint primary key,
  name text not null,
  type text,
  logo_url text,
  country_name text references public.countries (name) on update cascade,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
