-- 001_social_tables.sql
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── profiles ──────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text not null,
  created_at   timestamptz default now()
);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
create policy "profiles: read by any authenticated user"
  on profiles for select using (auth.role() = 'authenticated');
create policy "profiles: owner can update"
  on profiles for update using (auth.uid() = id);


-- ── groups ────────────────────────────────────────────────────────────────────
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('pair', 'group')),
  colour      text not null,
  created_by  uuid references auth.users on delete cascade not null,
  created_at  timestamptz default now()
);

alter table groups enable row level security;
create policy "groups: readable by members"
  on groups for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "groups: insertable by authenticated"
  on groups for insert with check (auth.uid() = created_by);
create policy "groups: deletable by owner"
  on groups for delete using (auth.uid() = created_by);


-- ── group_members ─────────────────────────────────────────────────────────────
create table if not exists group_members (
  group_id  uuid references groups on delete cascade not null,
  user_id   uuid references auth.users on delete cascade not null,
  role      text not null check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

alter table group_members enable row level security;
create policy "group_members: readable by members of that group"
  on group_members for select using (
    exists (
      select 1 from group_members gm2
      where gm2.group_id = group_members.group_id
        and gm2.user_id  = auth.uid()
    )
  );
create policy "group_members: insertable by group owner"
  on group_members for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
    or auth.uid() = user_id  -- owner inserts self when creating group
  );
create policy "group_members: deletable by owner or self"
  on group_members for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
  );


-- ── shared_events ─────────────────────────────────────────────────────────────
create table if not exists shared_events (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events on delete cascade not null,
  group_id   uuid references groups on delete cascade not null,
  shared_by  uuid references auth.users on delete cascade not null,
  shared_at  timestamptz default now(),
  unique (event_id, group_id)
);

alter table shared_events enable row level security;
create policy "shared_events: readable by group members"
  on shared_events for select using (
    exists (
      select 1 from group_members
      where group_members.group_id = shared_events.group_id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "shared_events: insertable by group members"
  on shared_events for insert with check (
    auth.uid() = shared_by
    and exists (
      select 1 from group_members
      where group_members.group_id = shared_events.group_id
        and group_members.user_id  = auth.uid()
    )
  );
create policy "shared_events: deletable by sharer"
  on shared_events for delete using (auth.uid() = shared_by);


-- ── rsvps ─────────────────────────────────────────────────────────────────────
create table if not exists rsvps (
  event_id   uuid references events on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  status     text not null check (status in ('going', 'maybe', 'cant')),
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
);

alter table rsvps enable row level security;
create policy "rsvps: readable by members of event's group"
  on rsvps for select using (
    exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = rsvps.event_id
        and gm.user_id  = auth.uid()
    )
  );
create policy "rsvps: writable by own user"
  on rsvps for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── comments ──────────────────────────────────────────────────────────────────
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references events on delete cascade not null,
  user_id    uuid references auth.users on delete cascade not null,
  body       text not null,
  created_at timestamptz default now()
);

alter table comments enable row level security;
create policy "comments: readable by members of event's group"
  on comments for select using (
    exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = comments.event_id
        and gm.user_id  = auth.uid()
    )
  );
create policy "comments: insertable by members"
  on comments for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from shared_events se
      join group_members gm on gm.group_id = se.group_id
      where se.event_id = comments.event_id
        and gm.user_id  = auth.uid()
    )
  );


-- ── notifications ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null,
  type       text not null check (type in ('event_shared', 'rsvp_updated', 'comment_added')),
  payload    jsonb not null,
  read       boolean default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;
create policy "notifications: owner only"
  on notifications for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable Realtime for notifications and comments
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table comments;
