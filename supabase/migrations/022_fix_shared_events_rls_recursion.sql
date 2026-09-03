-- 022_fix_shared_events_rls_recursion.sql
-- 019_fix_rls_idor_and_search_path.sql fixed a real IDOR (shared_events'
-- INSERT policy didn't check the sharer owned the event being shared) by
-- adding a subquery on `events` to that policy's WITH CHECK. That created a
-- circular RLS reference this project has hit and fixed before (see
-- 003_fix_rls_recursion.sql, 005_fix_rls_comprehensive.sql for the same
-- class of bug on group_members): `events`' own "events: readable if shared
-- to my group" policy queries `shared_events`, and now `shared_events`'
-- INSERT policy queries `events` right back - Postgres detects the cycle
-- and refuses with "infinite recursion detected in policy for relation
-- shared_events" the moment anyone tries to share an event to a group.
--
-- Same fix as last time: a SECURITY DEFINER function bypasses RLS on the
-- table it queries (Postgres doesn't apply RLS to a security-definer
-- function's own queries, same reasoning get_my_group_ids() already relies
-- on), so checking event ownership through one instead of a raw subquery
-- breaks the cycle without weakening the check itself - the IDOR migration
-- 019 fixed is still fully enforced.
--
-- Run in the Supabase SQL Editor after 021_realtime_publication.sql.

create or replace function public.event_owned_by_me(check_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events
    where id = check_event_id and user_id = auth.uid()
  );
$$;

drop policy if exists "shared_events: insertable by event owner who is a group member" on public.shared_events;

create policy "shared_events: insertable by event owner who is a group member"
  on public.shared_events for insert with check (
    auth.uid() = shared_by
    and group_id = any(select public.get_my_group_ids())
    and public.event_owned_by_me(event_id)
  );
