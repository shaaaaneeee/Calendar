-- 013_email_availability.sql
-- Lets the signup page reject an already-registered email up front, the
-- same way is_username_available (012) already gates usernames.
--
-- Run in the Supabase SQL Editor after 012_username_login.sql.
--
-- Note: auth.users is not exposed via PostgREST directly, and the client
-- can't be authenticated yet at signup time anyway - same security-definer
-- bypass pattern as get_email_for_login/is_username_available.
--
-- Known, accepted tradeoff (same one already taken for usernames): this
-- lets someone probe whether an email is registered. Slightly more
-- sensitive than a username since email is PII, but it's the same UX
-- being asked for here, applied consistently.
create or replace function public.is_email_available(check_email text)
returns boolean
language sql
security definer
stable
as $$
  select not exists (
    select 1 from auth.users where lower(email) = lower(check_email)
  );
$$;

grant execute on function public.is_email_available(text) to anon, authenticated;
