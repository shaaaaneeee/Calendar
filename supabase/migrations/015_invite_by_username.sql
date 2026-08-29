-- 015_invite_by_username.sql
-- Group invites switch from email to username. There's no separate invites
-- table to migrate (see 001/002/008) - an "invite" is just a notification
-- row with type='group_invite' and user_id set to the resolved invitee's
-- UUID, so this only needs a new resolver RPC alongside the existing
-- get_user_id_by_email (002_notification_triggers.sql) - not replacing it,
-- since other code paths may still reference it and dropping it isn't
-- necessary for this change.
--
-- Run in the Supabase SQL Editor after 014_remove_equipment.sql.
--
-- Note: profiles.username is nullable (012_username_login.sql) - accounts
-- created before that migration, or that just haven't set one, can't be
-- invited by username until they do. sendGroupInvite already surfaces a
-- clear "no account found" error in that case, same as the email path did
-- for an unregistered email.
create or replace function get_user_id_by_username(username_input text)
returns table (id uuid) language sql security definer as $$
  select id from profiles where lower(username) = lower(username_input) limit 1;
$$;

grant execute on function get_user_id_by_username(text) to authenticated;
