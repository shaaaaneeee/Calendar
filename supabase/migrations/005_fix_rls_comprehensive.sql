-- 005_fix_rls_comprehensive.sql
-- Run in Supabase SQL Editor.
--
-- Root cause of the "infinite recursion detected in policy for relation
-- group_members" error: PostgreSQL can inline STABLE SQL functions into
-- the calling query, which removes the SECURITY DEFINER context and
-- causes the policy to self-reference group_members recursively.
--
-- Fix: rewrite get_my_group_ids() in PL/pgSQL, which is NEVER inlined by
-- the optimizer. This guarantees the function always runs as its definer
-- (bypassing RLS on group_members) regardless of query planning.
--
-- Also bundles the fix from 004 (creator can read their own group before
-- they are in group_members) in case that was not yet applied.

-- ── Step 1: Replace the helper with a plpgsql version (never inlined) ──────────
create or replace function get_my_group_ids()
returns setof uuid
language plpgsql
security definer
stable
as $$
begin
  return query
    select group_id from group_members where user_id = auth.uid();
end;
$$;

-- ── Step 2: Drop ALL existing SELECT policies on the two affected tables ────────
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'group_members'
      and cmd        = 'SELECT'
  loop
    execute format('drop policy if exists %I on group_members', pol.policyname);
  end loop;

  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'groups'
      and cmd        = 'SELECT'
  loop
    execute format('drop policy if exists %I on groups', pol.policyname);
  end loop;
end;
$$;

-- ── Step 3: Recreate group_members SELECT policy (non-recursive) ────────────────
create policy "group_members: readable by members"
  on group_members for select using (
    group_id = any(select get_my_group_ids())
  );

-- ── Step 4: Recreate groups SELECT policies ─────────────────────────────────────
create policy "groups: readable by members"
  on groups for select using (
    id = any(select get_my_group_ids())
  );

-- Lets the creator read their own group immediately after INSERT,
-- before the group_members row has been inserted.
create policy "groups: creator can read own group"
  on groups for select using (
    auth.uid() = created_by
  );
