-- 021_realtime_publication.sql
-- data-store.js (extension/utils/data-store.js) and supabase-client.js's new
-- subscribeSettings() helper open postgres_changes Realtime subscriptions on
-- events, shared_events, groups, group_members, and settings - but Realtime
-- only ever emits postgres_changes events for tables that have been
-- explicitly added to the `supabase_realtime` publication. Only
-- `notifications` and `comments` were ever added (see the
-- `alter publication supabase_realtime add table ...` lines near the end of
-- 001_social_tables.sql). Every one of these five new channels therefore
-- subscribes successfully and then simply never fires - live sync is
-- currently inert for events, groups, and settings.
--
-- Run in the Supabase SQL Editor after
-- 020_revoke_anon_get_user_id_by_email.sql.

alter publication supabase_realtime add table events;
alter publication supabase_realtime add table shared_events;
alter publication supabase_realtime add table groups;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table settings;
