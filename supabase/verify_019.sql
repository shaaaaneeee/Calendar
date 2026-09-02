-- verify_019.sql
-- Run in the Supabase SQL Editor after 019_fix_rls_idor_and_search_path.sql
-- to confirm it actually applied. Read-only — does not modify anything.
--
-- Everything is bundled into ONE result row (as JSON) so the SQL Editor's
-- "only shows the last statement's result" behavior doesn't hide anything.

select jsonb_build_object(

  -- Expect exactly these two policy names (the old ones were dropped).
  -- with_check should show the ownership/invite conditions from 019, not
  -- just "auth.uid() = user_id" or "auth.uid() = shared_by" alone.
  'group_members_and_shared_events_policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'cmd', cmd, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('group_members', 'shared_events')
      and cmd = 'INSERT'
  ),

  -- Every row here should show search_path in "config" (e.g.
  -- {search_path=public, pg_temp}). A null config means that function's
  -- search_path was NOT pinned - re-run 019.
  'security_definer_function_search_paths', (
    select jsonb_agg(jsonb_build_object(
      'function', p.proname, 'config', p.proconfig
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true  -- security definer functions only
  ),

  -- get_user_id_by_email should now show 'authenticated' only, not 'anon'.
  'get_user_id_by_email_grantees', (
    select jsonb_agg(grantee order by grantee)
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name   = 'get_user_id_by_email'
      and privilege_type = 'EXECUTE'
  )

) as verify_019_result;
