-- 012_username_login.sql
-- Adds real usernames to profiles, lets sign-in accept a username OR an
-- email, and backs the dedicated signup page's live availability check.
--
-- Run in the Supabase SQL Editor after 011_equipment.sql.

-- ── 1. username column ────────────────────────────────────────────────────────
-- Nullable: existing accounts have none until they set one (Settings > Account).
alter table public.profiles add column if not exists username text;

-- Case-insensitive uniqueness. Multiple NULLs are fine under a unique index.
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username));

-- 3-20 chars, letters/numbers/underscore.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$');
  end if;
end;
$$;

-- ── 2. handle_new_user — also set username from signup metadata ──────────────
-- The client passes { data: { username } } to auth.signUp(), which Supabase
-- stores on auth.users.raw_user_meta_data, readable here via new.raw_user_meta_data.
--
-- If the username collides (a race with the client-side availability check -
-- the check happens moments before signUp, so this should be rare but is not
-- impossible), we still create the profile row without a username instead of
-- losing the whole insert to the outer exception handler.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  begin
    insert into public.profiles (id, display_name, username)
    values (
      new.id,
      split_part(new.email, '@', 1),
      new.raw_user_meta_data->>'username'
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    raise log 'handle_new_user: username collision for %, creating profile without it', new.id;
    insert into public.profiles (id, display_name)
    values (new.id, split_part(new.email, '@', 1))
    on conflict (id) do nothing;
  end;
  return new;
exception when others then
  raise log 'handle_new_user error for %: % (%)', new.id, sqlerrm, sqlstate;
  return new;
end;
$$;

-- ── 3. get_email_for_login — resolve a sign-in identifier to an email ────────
-- profiles RLS only allows reads by 'authenticated' users, so a logged-out
-- client cannot look up a username's email directly - this security-definer
-- function is the sanctioned bypass, scoped to exactly this one lookup.
--
-- Known tradeoff: returning null vs. an email lets someone probe whether a
-- username exists. Every "log in with username" system has this same
-- property (GitHub, Reddit, X, etc.) - not unique to this implementation.
create or replace function public.get_email_for_login(identifier text)
returns text
language plpgsql
security definer
stable
as $$
declare
  found_email text;
begin
  if identifier is null or length(trim(identifier)) = 0 then
    return null;
  end if;

  if identifier ilike '%@%' then
    return identifier;
  end if;

  select u.email into found_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(identifier)
  limit 1;

  return found_email;
end;
$$;

grant execute on function public.get_email_for_login(text) to anon, authenticated;

-- ── 4. is_username_available — live check for the signup page / Settings ────
create or replace function public.is_username_available(check_username text)
returns boolean
language sql
security definer
stable
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(check_username)
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;
