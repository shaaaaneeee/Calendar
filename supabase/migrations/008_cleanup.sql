-- 008_cleanup.sql
-- Idempotent consolidation of all RLS policies, functions, and triggers.
-- Supersedes the incremental fixes in 003–007.
--
-- Run in Supabase SQL Editor. Safe regardless of which prior migrations
-- have been applied — drops all social-table policies and recreates the
-- canonical final state from scratch.

-- ── 1. Drop every existing policy on the social tables ───────────────────────
do $$
declare pol record;
begin
  for pol in
    select tablename, policyname
    from   pg_policies
    where  schemaname = 'public'
      and  tablename in (
        'profiles', 'groups', 'group_members',
        'shared_events', 'rsvps', 'comments', 'notifications'
      )
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

-- Drop the one policy we own on events (added by migration 007)
drop policy if exists "events: readable if shared to my group" on public.events;

-- ── 2. Ensure RLS is on ───────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.shared_events enable row level security;
alter table public.rsvps         enable row level security;
alter table public.comments      enable row level security;
alter table public.notifications enable row level security;

-- ── 3. Helper: current user's group IDs (bypasses RLS, never inlined) ─────────
create or replace function public.get_my_group_ids()
returns setof uuid
language plpgsql
security definer
stable
as $$
begin
  return query
    select group_id from public.group_members where user_id = auth.uid();
end;
$$;

-- ── 4. handle_new_user — schema-qualified, exception-safe ────────────────────
-- Exception handler prevents a profiles-insert failure from blocking signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
exception when others then
  raise log 'handle_new_user error for %: % (%)', new.id, sqlerrm, sqlstate;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 5. profiles ───────────────────────────────────────────────────────────────
-- INSERT: needed so the security-definer trigger can write rows when RLS is on.
create policy "profiles: insert for trigger"
  on public.profiles for insert with check (true);

create policy "profiles: read by authenticated"
  on public.profiles for select using (auth.role() = 'authenticated');

create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- ── 6. groups ─────────────────────────────────────────────────────────────────
create policy "groups: readable by members"
  on public.groups for select using (
    id = any(select public.get_my_group_ids())
  );

-- Creator can read the group immediately after INSERT, before they're in
-- group_members (the member row is added in a separate client call).
create policy "groups: creator can read own group"
  on public.groups for select using (auth.uid() = created_by);

create policy "groups: insertable by authenticated"
  on public.groups for insert with check (auth.uid() = created_by);

create policy "groups: deletable by owner"
  on public.groups for delete using (auth.uid() = created_by);

-- ── 7. group_members ──────────────────────────────────────────────────────────
-- SELECT uses get_my_group_ids() to avoid self-referential RLS recursion.
create policy "group_members: readable by members"
  on public.group_members for select using (
    group_id = any(select public.get_my_group_ids())
  );

-- A user can add themselves, or the group creator can add others.
create policy "group_members: insertable by owner or self"
  on public.group_members for insert with check (
    auth.uid() = user_id
    or auth.uid() = (
      select created_by from public.groups where id = group_members.group_id
    )
  );

create policy "group_members: deletable by owner or self"
  on public.group_members for delete using (
    auth.uid() = user_id
    or auth.uid() = (
      select created_by from public.groups where id = group_members.group_id
    )
  );

-- ── 8. shared_events ──────────────────────────────────────────────────────────
create policy "shared_events: readable by group members"
  on public.shared_events for select using (
    group_id = any(select public.get_my_group_ids())
  );

create policy "shared_events: insertable by group members"
  on public.shared_events for insert with check (
    auth.uid() = shared_by
    and group_id = any(select public.get_my_group_ids())
  );

create policy "shared_events: deletable by sharer"
  on public.shared_events for delete using (auth.uid() = shared_by);

-- ── 9. rsvps ──────────────────────────────────────────────────────────────────
create policy "rsvps: readable by group members"
  on public.rsvps for select using (
    exists (
      select 1 from public.shared_events
      where shared_events.event_id = rsvps.event_id
        and shared_events.group_id = any(select public.get_my_group_ids())
    )
  );

create policy "rsvps: writable by own user"
  on public.rsvps for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 10. comments ──────────────────────────────────────────────────────────────
create policy "comments: readable by group members"
  on public.comments for select using (
    exists (
      select 1 from public.shared_events
      where shared_events.event_id = comments.event_id
        and shared_events.group_id = any(select public.get_my_group_ids())
    )
  );

create policy "comments: insertable by members"
  on public.comments for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.shared_events
      where shared_events.event_id = comments.event_id
        and shared_events.group_id = any(select public.get_my_group_ids())
    )
  );

-- ── 11. notifications ─────────────────────────────────────────────────────────
create policy "notifications: owner only"
  on public.notifications for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Group owners need to INSERT a group_invite notification addressed to the
-- invitee (user_id = invitee ≠ auth.uid()), so the owner-only policy alone
-- would block them. This adds a narrowly-scoped INSERT exception.
create policy "notifications: group owner can send invites"
  on public.notifications for insert with check (
    type = 'group_invite'
    and (payload->>'group_id') is not null
    and exists (
      select 1 from public.groups
      where id         = (payload->>'group_id')::uuid
        and created_by = auth.uid()
    )
  );

-- ── 11b. Extend notifications.type to include group_invite ────────────────────
do $$
declare cname text;
begin
  select conname into cname
  from   pg_constraint
  where  conrelid = 'public.notifications'::regclass
    and  contype  = 'c'
    and  pg_get_constraintdef(oid) like '%event_shared%';
  if cname is not null then
    execute format('alter table public.notifications drop constraint %I', cname);
  end if;
end;
$$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('event_shared', 'rsvp_updated', 'comment_added', 'group_invite'));

-- ── 12. events — allow members to read events shared to their groups ──────────
create policy "events: readable if shared to my group"
  on public.events for select using (
    exists (
      select 1 from public.shared_events
      where shared_events.event_id = events.id
        and shared_events.group_id = any(select public.get_my_group_ids())
    )
  );

-- ── 13. Backfill any auth users missing a profiles row ───────────────────────
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1)
from   auth.users
where  id not in (select id from public.profiles)
on conflict (id) do nothing;
