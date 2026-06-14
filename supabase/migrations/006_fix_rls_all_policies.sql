-- 006_fix_rls_all_policies.sql
-- Run in Supabase SQL Editor.
--
-- Root cause: migration 005 fixed the SELECT policy on group_members
-- but the INSERT and DELETE policies still contained raw
-- "EXISTS (SELECT 1 FROM group_members gm WHERE ...)" subqueries.
-- Those subqueries trigger a re-entrant RLS evaluation on group_members
-- which can still produce "infinite recursion detected in policy for
-- relation group_members", even after the SELECT policy was fixed.
--
-- Fix: eliminate ALL self-references in group_members policies.
-- Owner checks are rewritten to use groups.created_by instead of
-- querying group_members for role = 'owner'.

-- ── Step 1: Drop every existing policy on group_members ─────────────────────────
do $$
declare pol record;
begin
  for pol in
    select policyname
    from   pg_policies
    where  schemaname = 'public'
      and  tablename  = 'group_members'
  loop
    execute format('drop policy if exists %I on group_members', pol.policyname);
  end loop;
end;
$$;

-- ── Step 2: Recreate all group_members policies without self-references ──────────

-- SELECT: use the plpgsql security-definer function (no self-reference)
create policy "group_members: readable by members"
  on group_members for select using (
    group_id = any(select get_my_group_ids())
  );

-- INSERT: a user can insert themselves, or the group creator can add others
create policy "group_members: insertable by owner or self"
  on group_members for insert with check (
    auth.uid() = user_id
    or auth.uid() = (
      select created_by from groups where id = group_members.group_id
    )
  );

-- DELETE: a user can remove themselves, or the group creator can remove anyone
create policy "group_members: deletable by owner or self"
  on group_members for delete using (
    auth.uid() = user_id
    or auth.uid() = (
      select created_by from groups where id = group_members.group_id
    )
  );
