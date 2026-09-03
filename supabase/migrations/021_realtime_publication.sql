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
-- Two follow-on fixes bundled in here, found in review before this was ever
-- applied:
--   1. Idempotent: `add table` errors if a table was ever toggled on via the
--      Supabase dashboard's own Realtime UI, which would abort the whole
--      script partway through and silently leave the rest unpublished. Each
--      statement is wrapped to no-op if the table is already a member.
--   2. `replica identity full` on all five: the default (primary-key-only)
--      replica identity means a DELETE's WAL record carries only the primary
--      key, which isn't enough for `events`' user_id-filtered channel to
--      match, or for the unfiltered shared_events/groups/group_members
--      channels' consumers to evaluate. Without this, deleting an event,
--      unsharing it, or leaving/deleting a group would still never
--      propagate live even after the publication fix above.
--
-- Run in the Supabase SQL Editor after
-- 020_revoke_anon_get_user_id_by_email.sql.

do $$
begin
  begin
    alter publication supabase_realtime add table events;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table shared_events;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table groups;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table group_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table settings;
  exception when duplicate_object then null;
  end;
end;
$$;

alter table events        replica identity full;
alter table shared_events replica identity full;
alter table groups        replica identity full;
alter table group_members replica identity full;
alter table settings      replica identity full;
