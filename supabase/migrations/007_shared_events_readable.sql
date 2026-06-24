-- 007_shared_events_readable.sql
-- Run in Supabase SQL Editor.
--
-- Problem: Events.getAll() only returns the calling user's own events.
-- When a group member shares one of their events to a group you belong to,
-- you cannot see it on your calendar because the events table RLS only
-- permits access to rows where user_id = auth.uid().
--
-- Fix: add a second SELECT policy on events that allows reading any event
-- that has been shared to a group the current user is a member of.
-- Uses get_my_group_ids() (plpgsql security definer, non-recursive).

create policy "events: readable if shared to my group"
  on events for select using (
    exists (
      select 1
      from   shared_events
      where  shared_events.event_id = events.id
        and  shared_events.group_id = any(select get_my_group_ids())
    )
  );
