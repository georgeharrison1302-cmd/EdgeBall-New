ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS status_short text,
  ADD COLUMN IF NOT EXISTS status_long text,
  ADD COLUMN IF NOT EXISTS elapsed integer,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/London';

UPDATE public.fixtures
SET timezone = 'Europe/London'
WHERE timezone IS NULL;
