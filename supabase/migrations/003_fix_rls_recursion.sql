-- 003_fix_rls_recursion.sql
-- Run in Supabase SQL Editor after 001 and 002.
--
-- Problem: the group_members SELECT policy queries group_members itself,
-- causing "infinite recursion detected in policy for relation group_members".
--
-- Fix: a SECURITY DEFINER function that bypasses RLS to return the current
-- user's group IDs, used as the basis for all membership checks.

-- ── Helper: returns the calling user's group IDs without triggering RLS ────────
create or replace function get_my_group_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select group_id from group_members where user_id = auth.uid();
$$;

-- ── Recreate group_members SELECT policy (was self-referential → recursion) ───
drop policy if exists "group_members: readable by members of that group" on group_members;
create policy "group_members: readable by members of that group"
  on group_members for select using (
    group_id = any(select get_my_group_ids())
  );

-- ── Recreate groups SELECT policy to use the same function ────────────────────
drop policy if exists "groups: readable by members" on groups;
create policy "groups: readable by members"
  on groups for select using (
    id = any(select get_my_group_ids())
  );
