-- 010_add_location_place_words.sql
-- Add support for destination/place detection:
--   - events.location: the extracted/edited place for an event
--   - settings.place_words: user-defined custom place words (+1 detection score each)

alter table public.events   add column if not exists location    text;
alter table public.settings add column if not exists place_words text[] default '{}';
