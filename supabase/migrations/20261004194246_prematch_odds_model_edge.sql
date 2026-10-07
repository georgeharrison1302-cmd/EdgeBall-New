ALTER TABLE public.prematch_odds
  ADD COLUMN IF NOT EXISTS model_prob numeric,
  ADD COLUMN IF NOT EXISTS edge_pct numeric;
