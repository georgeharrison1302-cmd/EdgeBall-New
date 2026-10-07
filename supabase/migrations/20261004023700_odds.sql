CREATE TABLE public.odds (
  fixture_id integer PRIMARY KEY,
  update_time timestamp with time zone,
  markets jsonb
);
