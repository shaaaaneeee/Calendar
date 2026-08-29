-- 014_remove_equipment.sql
-- Reverses 011_equipment.sql - the Equipment feature (and its UI pages) has
-- been removed from the extension entirely.
--
-- Run in the Supabase SQL Editor after 013_email_availability.sql.

-- Dropping shared_equipment/equipment cascades away their policies and the
-- trg_notify_equipment_shared trigger automatically.
drop table if exists shared_equipment cascade;
drop table if exists equipment cascade;
drop function if exists notify_equipment_shared() cascade;

-- Strip 'equipment_shared' back out of the notifications type check. Must
-- keep every other type that's actually still in use (group_invite, added in
-- 008_cleanup.sql, is live and unrelated to equipment - dropping it would
-- silently break the group-invite feature).
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('event_shared', 'rsvp_updated', 'comment_added', 'group_invite'));
