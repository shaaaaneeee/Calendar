-- 020_revoke_anon_get_user_id_by_email.sql
-- Follow-up to 019_fix_rls_idor_and_search_path.sql: that migration tried to
-- narrow get_user_id_by_email's exposure with
--   revoke execute on function public.get_user_id_by_email(text) from public;
-- but verify_019.sql showed 'anon' still listed as a grantee afterward.
--
-- Cause: Supabase configures ALTER DEFAULT PRIVILEGES on the public schema
-- to auto-grant EXECUTE to anon/authenticated/service_role directly (not
-- via the PUBLIC pseudo-role) on every CREATE OR REPLACE FUNCTION. 019's
-- CREATE OR REPLACE (to pin search_path) silently re-granted anon access;
-- revoking from PUBLIC never touched that direct grant.
--
-- Run in the Supabase SQL Editor after 019_fix_rls_idor_and_search_path.sql.

revoke execute on function public.get_user_id_by_email(text) from anon;

-- Re-run this afterward to confirm 'anon' is gone from the grantee list:
--   supabase/verify_019.sql
