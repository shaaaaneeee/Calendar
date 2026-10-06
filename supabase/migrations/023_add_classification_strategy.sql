-- 023_add_classification_strategy.sql
-- Adds settings.classification_strategy: which on-device ML detection
-- strategy a user has toggled - 'layered' (default, won the accuracy
-- benchmark) or 'full'. The old rules-only 'legacy' mode has been
-- removed as a selectable strategy entirely, so it's not a valid value
-- here. Default matches the client's DEFAULT_SETTINGS so existing rows
-- need no backfill. Not yet applied to the live project as of writing -
-- run this in the Supabase SQL Editor before relying on cross-device
-- sync of this setting.

alter table public.settings
  add column if not exists classification_strategy text not null default 'layered'
  check (classification_strategy in ('layered', 'full'));
