-- Closing-line value support: stamp the last stored bookmaker price when a
-- tip's fixture kicks off, so /record can answer "did our price beat the close?".
-- Frozen at stamp time like the rest of the ledger — never repriced later.

alter table public.model_tips
  add column if not exists closing_odds numeric,
  add column if not exists closed_at timestamptz;
