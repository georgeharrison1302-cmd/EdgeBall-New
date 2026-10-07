-- service_role needs sequence USAGE to INSERT into serial PK fixture_events.id
GRANT USAGE, SELECT ON SEQUENCE public.fixture_events_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixture_events TO service_role;
