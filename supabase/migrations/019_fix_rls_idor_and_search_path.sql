-- 019_fix_rls_idor_and_search_path.sql
-- Security hardening pass (2026-09-03 audit):
--
-- 1. group_members INSERT allowed ANY authenticated user to add themselves to
--    ANY group just by knowing its id - the "self" branch of the policy never
--    checked that an invite actually happened. Now requires either group
--    ownership (unchanged) or a matching group_invite notification addressed
--    to the joining user for that group (matches the client's actual
--    createGroup / acceptGroupInvite flows in supabase-client.js).
-- 2. shared_events INSERT let a group member share ANY event_id into a group
--    they belong to, regardless of whether they owned that event - exposing
--    a stranger's private event (title/date/location/notes) to the group via
--    the "events: readable if shared to my group" policy. Now requires the
--    sharer to own the event being shared.
-- 3. Every SECURITY DEFINER function gets `set search_path = public, pg_temp`
--    pinned, closing the standard Postgres search_path-hijack footgun for
--    functions that run with elevated privilege. Bodies are unchanged except
--    for this addition.
-- 4. get_user_id_by_email (002_notification_triggers.sql) is unused by the
--    client (username-based lookup replaced it in 015_invite_by_username.sql)
--    and was executable by anon via Postgres's default PUBLIC grant - narrows
--    it to authenticated instead of dropping it, since 015's own comment says
--    it was deliberately kept around.
--
-- Run in the Supabase SQL Editor after 018_groups_update_policy.sql.

-- ── 1. group_members: self-join now requires a real pending invite ──────────
drop policy if exists "group_members: insertable by owner or self" on public.group_members;

create policy "group_members: insertable by owner or invited self"
  on public.group_members for insert with check (
    auth.uid() = (select created_by from public.groups where id = group_members.group_id)
    or (
      auth.uid() = user_id
      and exists (
        select 1 from public.notifications
        where notifications.user_id = auth.uid()
          and notifications.type    = 'group_invite'
          and (notifications.payload ->> 'group_id')::uuid = group_members.group_id
      )
    )
  );

-- ── 2. shared_events: sharer must own the event being shared ────────────────
drop policy if exists "shared_events: insertable by group members" on public.shared_events;

create policy "shared_events: insertable by event owner who is a group member"
  on public.shared_events for insert with check (
    auth.uid() = shared_by
    and group_id = any(select public.get_my_group_ids())
    and exists (
      select 1 from public.events
      where events.id      = shared_events.event_id
        and events.user_id = auth.uid()
    )
  );

-- ── 3. Pin search_path on every SECURITY DEFINER function ───────────────────

create or replace function public.get_my_group_ids()
returns setof uuid
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  return query
    select group_id from public.group_members where user_id = auth.uid();
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.notify_event_shared()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_row record;
  evt_title  text;
  actor_name text;
  grp_name   text;
begin
  select title into evt_title  from events   where id = new.event_id;
  select display_name into actor_name from profiles where id = new.shared_by;
  select name         into grp_name   from groups   where id = new.group_id;

  for member_row in
    select user_id from group_members
    where group_id = new.group_id
      and user_id <> new.shared_by
  loop
    insert into notifications (user_id, type, payload)
    values (
      member_row.user_id,
      'event_shared',
      jsonb_build_object(
        'event_id',   new.event_id,
        'group_id',   new.group_id,
        'actor_id',   new.shared_by,
        'actor_name', coalesce(actor_name, 'Someone'),
        'preview',    coalesce(evt_title, 'an event'),
        'group_name', coalesce(grp_name, 'a group')
      )
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_rsvp_updated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_owner uuid;
  actor_name  text;
  evt_title   text;
  grp_id      uuid;
begin
  select user_id, title into event_owner, evt_title
    from public.events where id = new.event_id;

  if event_owner is null or new.user_id = event_owner then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.user_id;

  select group_id into grp_id from public.shared_events
    where event_id = new.event_id limit 1;

  insert into public.notifications (user_id, type, payload)
  values (
    event_owner,
    'rsvp_updated',
    jsonb_build_object(
      'event_id',   new.event_id,
      'group_id',   grp_id,
      'actor_id',   new.user_id,
      'actor_name', coalesce(actor_name, 'Someone'),
      'preview',    coalesce(evt_title, 'an event'),
      'status',     new.status
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_comment_added()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_row  record;
  actor_name  text;
  evt_title   text;
  grp_id      uuid;
  preview     text;
begin
  select display_name into actor_name from profiles where id = new.user_id;
  select title        into evt_title  from events   where id = new.event_id;
  select group_id     into grp_id     from shared_events
  where event_id = new.event_id limit 1;

  preview := left(new.body, 60);

  for member_row in
    select distinct gm.user_id
    from shared_events se
    join group_members gm on gm.group_id = se.group_id
    where se.event_id = new.event_id
      and gm.user_id  <> new.user_id
  loop
    insert into notifications (user_id, type, payload)
    values (
      member_row.user_id,
      'comment_added',
      jsonb_build_object(
        'event_id',   new.event_id,
        'group_id',   grp_id,
        'actor_id',   new.user_id,
        'actor_name', coalesce(actor_name, 'Someone'),
        'preview',    coalesce(evt_title, 'an event'),
        'comment',    preview
      )
    );
  end loop;

  return new;
end;
$$;

create or replace function public.get_email_for_login(identifier text)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
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

create or replace function public.is_username_available(check_username text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(check_username)
  );
$$;

create or replace function public.is_email_available(check_email text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from auth.users where lower(email) = lower(check_email)
  );
$$;

create or replace function public.get_user_id_by_username(username_input text)
returns table (id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id from profiles where lower(username) = lower(username_input) limit 1;
$$;

create or replace function public.materialize_recurrences()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec        record;
  first_occ  date;
  step_days  int;
  horizon    date := current_date + interval '1 year';
  start_from date;
  occ_date   date;
begin
  for rec in select * from recurrences where user_id = auth.uid() loop
    if rec.materialized_until is not null and rec.materialized_until >= horizon then
      continue; -- already covered through the current horizon
    end if;

    step_days := rec.interval_weeks * 7;
    -- First occurrence: the nearest day_of_week on/after the series was
    -- created. Deterministic and stable across repeated calls since it's
    -- anchored to created_at, not "today" at call time.
    first_occ := rec.created_at::date
      + ((rec.day_of_week - extract(dow from rec.created_at::date)::int + 7) % 7);
    start_from := coalesce(rec.materialized_until, first_occ - 1) + 1;

    occ_date := first_occ;
    while occ_date <= horizon loop
      if occ_date >= start_from then
        insert into events (
          user_id, title, event_date, event_time, location,
          participants, notes, source_text, platform,
          recurrence_id, is_exception
        )
        values (
          rec.user_id, rec.title, occ_date, rec.event_time, rec.location,
          rec.participants, rec.notes, rec.source_text, rec.platform,
          rec.id, false
        )
        on conflict (recurrence_id, event_date) where recurrence_id is not null do nothing;
      end if;
      occ_date := occ_date + step_days;
    end loop;

    update recurrences set materialized_until = horizon where id = rec.id;
  end loop;
end;
$$;

create or replace function public.get_user_id_by_email(email_input text)
returns table (id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id from auth.users where email = email_input limit 1;
$$;

-- ── 4. Narrow the unused email-lookup RPC's exposure ─────────────────────────
revoke execute on function public.get_user_id_by_email(text) from public;
grant  execute on function public.get_user_id_by_email(text) to authenticated;
