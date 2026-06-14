-- 004_fix_groups_create.sql
-- Run in Supabase SQL Editor after 003.
--
-- Problem: INSERT into groups followed by .select().single() fails with an RLS
-- violation because the creator isn't in group_members yet, so the SELECT
-- policy (id = any(get_my_group_ids())) returns 0 rows.
--
-- Fix: add a policy that lets the creator always read their own groups,
-- independent of membership.

create policy "groups: creator can read own group"
  on groups for select using (auth.uid() = created_by);
