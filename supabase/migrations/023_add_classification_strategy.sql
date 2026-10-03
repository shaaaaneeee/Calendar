-- 023_add_classification_strategy.sql
-- Adds settings.classification_strategy: which detection engine a user is
-- opted into ('legacy' = rules.js/engine.js, 'layered'/'full' = the two
-- ML-based strategies being benchmarked against each other). Default
-- matches the client's DEFAULT_SETTINGS so existing rows need no backfill.

alter table public.settings
  add column if not exists classification_strategy text not null default 'legacy'
  check (classification_strategy in ('legacy', 'layered', 'full'));
